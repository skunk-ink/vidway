// FFmpeg.wasm wrapper — handles the one-time WASM load and exposes a
// `prepareVideo(file)` that does:
//
//   1. Remux to fragmented MP4 (`-c copy -movflags +frag_keyframe+empty_moov+default_base_moof`).
//      Output is the format MSE wants — small moov at the front, then `moof`+`mdat` fragments.
//   2. Extract a thumbnail at the 1-second mark, scaled to 640px wide.
//   3. Read duration / dimensions from the remuxed output via a `<video>` element
//      (cheaper than asking ffmpeg for them, and the output is what we'll display).
//
// `-c copy` means we don't re-encode video or audio, just remux. Fast, but
// requires the source's codecs to already be browser-friendly (H.264 + AAC
// is the sweet spot). VP9, HEVC, etc. will produce an output that won't play.

import { FFmpeg } from '@ffmpeg/ffmpeg'
import { toBlobURL } from '@ffmpeg/util'

// The ffmpeg-core JS + WASM are loaded from a CDN at runtime via toBlobURL.
// This is the canonical pattern from @ffmpeg/ffmpeg's README. We don't import
// them as Vite assets because @ffmpeg/core ships an `exports` map that doesn't
// expose `dist/umd/*` as importable subpaths — every Vite-friendly path runs
// into that wall. Loading from a CDN sidesteps it cleanly.
//
// We use the **ESM** build (`dist/esm`), not `dist/umd`, per the ffmpeg.wasm
// docs: "If you are a vite user, use esm in baseURL instead of umd." The
// worker that @ffmpeg/ffmpeg spawns is a module worker, which can `import()`
// the ESM core at runtime but can't `importScripts()` the UMD build —
// trying the UMD route in Vite produces "failed to import ffmpeg-core.js".
//
// Tradeoff: first upload requires internet for ~30 MB of fetches. The blob
// URLs are cached for the tab lifetime; the browser usually caches the
// underlying CDN responses across page loads as well.
const FFMPEG_CORE_VERSION = '0.12.10'
const FFMPEG_BASE_URL = `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${FFMPEG_CORE_VERSION}/dist/esm`

export type PreparedVideo = {
  fmp4: Blob
  thumbnail: Blob
  durationSec: number
  width: number
  height: number
  mime: 'video/mp4'
}

export type PrepareCallbacks = {
  /** Called as ffmpeg loads. Progress is 0..1. */
  onLoadProgress?: (progress: number) => void
  /** Called once ffmpeg is loaded, before the first ffmpeg.exec runs. */
  onLoaded?: () => void
  /** Called as each ffmpeg.exec runs. Stage names: 'remux' | 'thumbnail'. */
  onStageProgress?: (stage: 'remux' | 'thumbnail', progress: number) => void
}

let ffmpegInstance: FFmpeg | null = null
let loadPromise: Promise<FFmpeg> | null = null

/**
 * Lazily load and reuse a single FFmpeg instance for the whole tab.
 * Safe to call from multiple places concurrently.
 */
async function getFFmpeg(onLoadProgress?: (p: number) => void): Promise<FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance
  if (loadPromise) return loadPromise

  loadPromise = (async () => {
    const ffmpeg = new FFmpeg()

    // Pipe ffmpeg-core's internal logs to the console. Indispensable when
    // a WASM trap happens — the last few log lines almost always identify
    // the codec / container that ffmpeg choked on.
    ffmpeg.on('log', ({ type, message }) => {
      // type is 'fferr' | 'ffout' | 'info'
      if (type === 'fferr') console.warn(`[ffmpeg ${type}] ${message}`)
      else console.log(`[ffmpeg ${type}] ${message}`)
    })

    // toBlobURL fetches the served file and wraps it in a blob: URL. This
    // sidesteps cross-origin constraints when the wrapped JS internally
    // tries to load the WASM (and its worker, in mt builds).
    const [coreBlobUrl, wasmBlobUrl] = await Promise.all([
      toBlobURL(`${FFMPEG_BASE_URL}/ffmpeg-core.js`, 'text/javascript'),
      toBlobURL(`${FFMPEG_BASE_URL}/ffmpeg-core.wasm`, 'application/wasm'),
    ])

    if (onLoadProgress) {
      ffmpeg.on('progress', ({ progress }) => onLoadProgress(progress))
    }

    await ffmpeg.load({ coreURL: coreBlobUrl, wasmURL: wasmBlobUrl })

    ffmpegInstance = ffmpeg
    return ffmpeg
  })()

  return loadPromise
}

/**
 * Kick off ffmpeg loading in the background. Useful to call as soon as
 * the user picks a file so loading happens during form-fill time.
 */
export function preloadFFmpeg(): void {
  void getFFmpeg().catch(() => {
    // Errors here will resurface on the actual prepareVideo() call.
  })
}

export async function prepareVideo(
  file: File,
  callbacks?: PrepareCallbacks,
): Promise<PreparedVideo> {
  const ffmpeg = await getFFmpeg(callbacks?.onLoadProgress)
  callbacks?.onLoaded?.()

  // Use the original file's extension for the input name — ffmpeg
  // detects the container from the extension when explicit `-f` isn't
  // supplied. If there's no extension we fall back to .bin.
  const ext = file.name.match(/\.[^.]+$/)?.[0]?.toLowerCase() ?? '.bin'
  const inputName = `input${ext}`
  const outputName = 'output.mp4'
  const thumbName = 'thumb.jpg'

  // Wire up per-stage progress. ffmpeg's `progress` event fires during
  // exec(), and we re-route it to the active stage.
  let activeStage: 'remux' | 'thumbnail' | null = null
  const progressHandler = ({ progress }: { progress: number }) => {
    if (activeStage && callbacks?.onStageProgress) {
      callbacks.onStageProgress(activeStage, Math.max(0, Math.min(1, progress)))
    }
  }
  ffmpeg.on('progress', progressHandler)

  // Same `step` helper pattern as in Upload.tsx — labels every call so
  // a WASM trap (e.g. "RuntimeError: index out of bounds") doesn't lose
  // its origin in the await chain.
  const step = async <T,>(name: string, fn: () => Promise<T>): Promise<T> => {
    console.log(`[ffmpeg] → ${name}`)
    try {
      const r = await fn()
      console.log(`[ffmpeg] ✓ ${name}`)
      return r
    } catch (e) {
      console.error(`[ffmpeg] ✗ ${name}:`, e)
      throw new Error(
        `ffmpeg ${name} failed: ${e instanceof Error ? e.message : String(e)}`,
        { cause: e },
      )
    }
  }

  console.log('[ffmpeg] preparing', {
    name: file.name,
    sizeBytes: file.size,
    type: file.type,
    detectedExt: ext,
  })

  try {
    // Read the source file into ffmpeg's virtual FS.
    await step('writeFile', async () => {
      const inputBytes = new Uint8Array(await file.arrayBuffer())
      return ffmpeg.writeFile(inputName, inputBytes)
    })

    // ----- Remux: source → fragmented MP4 -----
    activeStage = 'remux'
    callbacks?.onStageProgress?.('remux', 0)
    const remuxCode = await step('exec(remux)', () =>
      ffmpeg.exec([
        '-i', inputName,
        '-c', 'copy',
        '-movflags', '+frag_keyframe+empty_moov+default_base_moof',
        '-f', 'mp4',
        outputName,
      ]),
    )
    if (remuxCode !== 0) {
      throw new Error(
        `ffmpeg remux exited ${remuxCode}. The source's codecs may not fit in fragmented MP4 ` +
          'with -c copy. Try re-encoding the file as H.264 + AAC first, or upload an MP4 / MOV ' +
          'with H.264 video.',
      )
    }
    callbacks?.onStageProgress?.('remux', 1)

    // ----- Thumbnail: seek to 1s, take one frame, scale to 640 wide -----
    // Thumbnail failures must NOT take down the whole upload. Even a hard
    // WASM trap (e.g. seeking past the end of a very short clip) is caught
    // here and a placeholder image is used instead.
    activeStage = 'thumbnail'
    callbacks?.onStageProgress?.('thumbnail', 0)
    let thumbnail: Blob
    try {
      const thumbCode = await ffmpeg.exec([
        '-ss', '1',
        '-i', inputName,
        '-frames:v', '1',
        '-vf', 'scale=640:-2',
        '-q:v', '4', // JPEG quality (2-31, lower = better)
        thumbName,
      ])
      if (thumbCode === 0) {
        const thumbData = (await ffmpeg.readFile(thumbName)) as Uint8Array
        thumbnail = new Blob([thumbData as BlobPart], { type: 'image/jpeg' })
        console.log('[ffmpeg] ✓ exec(thumbnail)')
      } else {
        console.warn(`[ffmpeg] thumbnail exec returned ${thumbCode}, using placeholder`)
        thumbnail = await fallbackThumbnail(file.name)
      }
    } catch (e) {
      console.warn('[ffmpeg] thumbnail extraction trapped, using placeholder:', e)
      thumbnail = await fallbackThumbnail(file.name)
    }
    callbacks?.onStageProgress?.('thumbnail', 1)
    activeStage = null

    // Read the remuxed MP4 out.
    const fmp4Data = await step(
      'readFile(output)',
      async () => (await ffmpeg.readFile(outputName)) as Uint8Array,
    )
    const fmp4 = new Blob([fmp4Data as BlobPart], { type: 'video/mp4' })
    console.log('[ffmpeg] remuxed output size:', fmp4.size)

    // Extract duration / dimensions from the remuxed output. The browser
    // <video> element is the most reliable reader, and the result reflects
    // exactly what the player will see during playback.
    const meta = await step('readMetadata', () => readVideoMetadataFromBlob(fmp4))
    console.log('[ffmpeg] metadata:', meta)

    return {
      fmp4,
      thumbnail,
      durationSec: meta.durationSec,
      width: meta.width,
      height: meta.height,
      mime: 'video/mp4',
    }
  } finally {
    ffmpeg.off('progress', progressHandler)
    // Best-effort cleanup of the virtual FS.
    await ffmpeg.deleteFile(inputName).catch(() => {})
    await ffmpeg.deleteFile(outputName).catch(() => {})
    await ffmpeg.deleteFile(thumbName).catch(() => {})
  }
}

async function readVideoMetadataFromBlob(
  blob: Blob,
): Promise<{ durationSec: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const v = document.createElement('video')
    v.preload = 'metadata'
    v.muted = true
    v.onloadedmetadata = () => {
      resolve({
        durationSec: Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 0,
        width: v.videoWidth || 640,
        height: v.videoHeight || 360,
      })
      URL.revokeObjectURL(url)
    }
    v.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read remuxed video metadata'))
    }
    v.src = url
  })
}

// Fallback when ffmpeg's frame extraction fails (very short videos,
// unusual containers, etc.). Renders a neutral colored card derived
// from the filename.
async function fallbackThumbnail(label: string): Promise<Blob> {
  const tw = 640
  const th = 360
  const canvas = document.createElement('canvas')
  canvas.width = tw
  canvas.height = th
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas 2d context unavailable')
  const hash = [...label].reduce((a, c) => (a + c.charCodeAt(0)) | 0, 0)
  const hue = Math.abs(hash) % 360
  const grad = ctx.createLinearGradient(0, 0, tw, th)
  grad.addColorStop(0, `hsl(${hue}, 55%, 32%)`)
  grad.addColorStop(1, `hsl(${(hue + 40) % 360}, 60%, 18%)`)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, tw, th)
  ctx.fillStyle = 'white'
  ctx.font = 'bold 36px ui-sans-serif, system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label.length > 28 ? `${label.slice(0, 26)}…` : label, tw / 2, th / 2)
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('thumbnail encode failed'))),
      'image/jpeg',
      0.78,
    )
  })
}
