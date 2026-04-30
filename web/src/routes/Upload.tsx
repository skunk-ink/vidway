import { PinnedObject, encodedSize } from '@siafoundation/sia-storage'
import { type ChangeEvent, type DragEvent, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import {
  DATA_SHARDS,
  DEFAULT_EXPIRY_DAYS,
  EXPIRY_OPTIONS,
  MAX_VIDEO_BYTES,
  PARITY_SHARDS,
  computeValidUntil,
} from '../lib/constants'
import { type PreparedVideo, preloadFFmpeg, prepareVideo } from '../lib/ffmpeg'
import { formatBytes } from '../lib/format'
import { useAuthStore } from '../stores/auth'
import { useToastStore } from '../stores/toast'

type Stage =
  | 'idle'
  | 'loading-tools'
  | 'remuxing'
  | 'thumbnailing'
  | 'uploading'
  | 'pinning'
  | 'sharing'
  | 'submitting'
  | 'done'
  | 'error'

export function Upload() {
  const sdk = useAuthStore((s) => s.sdk)
  const addToast = useToastStore((s) => s.addToast)
  const navigate = useNavigate()

  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [expiryDays, setExpiryDays] = useState<number | null>(DEFAULT_EXPIRY_DAYS)
  const [dragOver, setDragOver] = useState(false)

  const [stage, setStage] = useState<Stage>('idle')
  const [progressBytes, setProgressBytes] = useState(0)
  const [stageFraction, setStageFraction] = useState(0)
  const [error, setError] = useState<string | null>(null)

  // Start fetching the ffmpeg WASM as soon as a file is picked. Loading
  // happens while the user fills out title/description/expiry.
  useEffect(() => {
    if (file) preloadFFmpeg()
  }, [file])

  const busy = stage !== 'idle' && stage !== 'error' && stage !== 'done'

  function pickFile(f: File | null) {
    setError(null)
    if (!f) {
      setFile(null)
      return
    }
    if (f.size > MAX_VIDEO_BYTES) {
      setError(`File too large (max ${formatBytes(MAX_VIDEO_BYTES)})`)
      return
    }
    setFile(f)
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''))
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(false)
    if (busy) return
    const f = e.dataTransfer.files?.[0]
    if (f) pickFile(f)
  }

  function onSelect(e: ChangeEvent<HTMLInputElement>) {
    pickFile(e.target.files?.[0] ?? null)
  }

  async function handleSubmit() {
    if (!sdk || !file || !title.trim()) return
    setError(null)

    // Each major step is wrapped in `step(name, fn)` so the next time
    // a WASM-level error like "index out of bounds" bubbles up, we know
    // *which* call produced it. Plain async-await collapses the stack
    // by the time it reaches the catch.
    const step = async <T,>(name: string, fn: () => Promise<T>): Promise<T> => {
      console.log(`[upload] → ${name}`)
      try {
        const r = await fn()
        console.log(`[upload] ✓ ${name}`)
        return r
      } catch (e) {
        console.error(`[upload] ✗ ${name}:`, e)
        throw new Error(
          `${name} failed: ${e instanceof Error ? e.message : String(e)}`,
          // @ts-expect-error -- Error.cause is widely supported, TS lib might lag
          { cause: e },
        )
      }
    }

    let prepared: PreparedVideo
    try {
      // ----- ffmpeg.wasm: remux + thumbnail -----
      setStage('loading-tools')
      setStageFraction(0)
      prepared = await step('prepareVideo', () =>
        prepareVideo(file, {
          onLoadProgress: (p) => {
            if (stage === 'loading-tools') setStageFraction(p)
          },
          onLoaded: () => {
            setStage('remuxing')
            setStageFraction(0)
          },
          onStageProgress: (s, p) => {
            setStage(s === 'remux' ? 'remuxing' : 'thumbnailing')
            setStageFraction(p)
          },
        }),
      )

      console.log('[upload] prepared:', {
        fmp4Size: prepared.fmp4.size,
        thumbnailSize: prepared.thumbnail.size,
        durationSec: prepared.durationSec,
        width: prepared.width,
        height: prepared.height,
      })

      // ----- Sia upload -----
      setStage('uploading')
      setProgressBytes(0)
      const sourceSize = prepared.fmp4.size
      const totalEncoded = await step('encodedSize', async () =>
        encodedSize(sourceSize, DATA_SHARDS, PARITY_SHARDS),
      )
      console.log('[upload] totalEncoded:', totalEncoded, 'sourceSize:', sourceSize)

      const obj = await step('sdk.upload', () =>
        sdk.upload(new PinnedObject(), prepared.fmp4.stream(), {
          dataShards: DATA_SHARDS,
          parityShards: PARITY_SHARDS,
          onShardUploaded: (p) => {
            setProgressBytes((prev) =>
              Math.min(sourceSize, prev + (p.shardSize / Number(totalEncoded)) * sourceSize),
            )
          },
        }),
      )

      // ----- On-Sia metadata -----
      setStage('pinning')
      await step('updateMetadata', async () =>
        obj.updateMetadata(
          new TextEncoder().encode(
            JSON.stringify({
              schema: 'vidway/video/v1',
              title: title.trim(),
              description: description.trim(),
              durationSec: prepared.durationSec,
              width: prepared.width,
              height: prepared.height,
              mime: prepared.mime,
            }),
          ),
        ),
      )
      await step('sdk.pinObject', () => sdk.pinObject(obj))
      await step('sdk.updateObjectMetadata', () => sdk.updateObjectMetadata(obj))

      // ----- Share URL -----
      setStage('sharing')
      const validUntil = computeValidUntil(expiryDays)
      const shareUrl = await step('sdk.shareObject', async () =>
        sdk.shareObject(obj, validUntil),
      )

      // ----- Vidway catalog (signed) -----
      setStage('submitting')
      const thumbnailB64 = await blobToBase64(prepared.thumbnail)
      const { id } = await step('api.createListing', () =>
        api.createListing(
          {
            shareUrl,
            title: title.trim(),
            description: description.trim(),
            durationSec: prepared.durationSec,
            width: prepared.width,
            height: prepared.height,
            thumbnailB64,
            validUntil: validUntil.toISOString(),
          },
          sdk.appKey(),
        ),
      )

      setStage('done')
      addToast('Listing created')
      navigate(`/v/${id}`)
    } catch (e) {
      console.error(e)
      setError(e instanceof Error ? e.message : String(e))
      setStage('error')
      addToast('Upload failed', 'error')
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-8 w-full space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">Upload</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
          Your video is remuxed to fragmented MP4 in the browser, encrypted, and stored on Sia from
          your own indexer account. Vidway only stores the share URL and the metadata you provide.
        </p>
      </div>

      {/* Dropzone */}
      <div
        onDragOver={(e) => {
          e.preventDefault()
          if (!busy) setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          dragOver
            ? 'border-neutral-900 bg-neutral-50 dark:bg-neutral-900'
            : file
              ? 'border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900'
              : 'border-neutral-300 dark:border-neutral-700 bg-neutral-50/50 dark:bg-neutral-900/50 hover:bg-neutral-50 dark:hover:bg-neutral-800'
        }`}
      >
        {file ? (
          <div className="space-y-1">
            <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">{file.name}</p>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {formatBytes(file.size)}
              {file.type ? ` · ${file.type}` : ''}
            </p>
            {!busy && (
              <button
                type="button"
                onClick={() => pickFile(null)}
                className="text-xs text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 underline mt-2"
              >
                Choose a different file
              </button>
            )}
          </div>
        ) : (
          <label className="block cursor-pointer space-y-2">
            <p className="text-sm text-neutral-700 dark:text-neutral-300">Drop a video here, or click to browse.</p>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              MP4 / MOV with H.264 + AAC works best. Other codecs may not play.
            </p>
            <input
              type="file"
              accept="video/*"
              className="hidden"
              onChange={onSelect}
              disabled={busy}
            />
          </label>
        )}
      </div>

      {/* Title */}
      <div className="space-y-1">
        <label
          htmlFor="title"
          className="text-xs font-medium text-neutral-700 dark:text-neutral-300 uppercase tracking-wide"
        >
          Title
        </label>
        <input
          id="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          disabled={busy}
          className="w-full px-3 py-2 bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-lg text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-neutral-900 dark:focus:border-neutral-100 disabled:bg-neutral-50"
        />
      </div>

      {/* Description */}
      <div className="space-y-1">
        <label
          htmlFor="description"
          className="text-xs font-medium text-neutral-700 dark:text-neutral-300 uppercase tracking-wide"
        >
          Description (optional)
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          maxLength={5000}
          disabled={busy}
          className="w-full px-3 py-2 bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-lg text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-neutral-900 dark:focus:border-neutral-100 disabled:bg-neutral-50 resize-y"
        />
      </div>

      {/* Expiry */}
      <div className="space-y-1">
        <label
          htmlFor="expiry"
          className="text-xs font-medium text-neutral-700 dark:text-neutral-300 uppercase tracking-wide"
        >
          Available for
        </label>
        <select
          id="expiry"
          value={expiryDays === null ? 'unlimited' : String(expiryDays)}
          onChange={(e) =>
            setExpiryDays(e.target.value === 'unlimited' ? null : Number(e.target.value))
          }
          disabled={busy}
          className="w-full px-3 py-2 bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-lg text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-neutral-900 dark:focus:border-neutral-100 disabled:bg-neutral-50"
        >
          {EXPIRY_OPTIONS.map((o) => (
            <option key={o.label} value={o.days === null ? 'unlimited' : String(o.days)}>
              {o.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          {expiryDays === null
            ? 'The share URL will stay valid until you delete this listing.'
            : `The share URL will be valid until ${new Date(
                Date.now() + expiryDays * 86_400_000,
              ).toLocaleDateString()}.`}
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-800 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Progress */}
      {busy && (
        <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 space-y-2">
          <div className="flex justify-between text-xs text-neutral-700 dark:text-neutral-300">
            <span>{stageLabel(stage)}</span>
            {stage === 'uploading' && file ? (
              <span className="tabular-nums">
                {formatBytes(progressBytes)} / {formatBytes(file.size)}
              </span>
            ) : (
              <span className="tabular-nums">{Math.round(stageFraction * 100)}%</span>
            )}
          </div>
          <div className="h-1.5 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-neutral-900 dark:bg-neutral-100 transition-all duration-200"
              style={{ width: `${barWidth(stage, stageFraction, progressBytes, file?.size ?? 1)}%` }}
            />
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!file || !title.trim() || busy}
        className="w-full py-3 bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-white disabled:bg-neutral-300 dark:disabled:bg-neutral-700 disabled:text-neutral-500 dark:disabled:text-neutral-400 text-white dark:text-neutral-900 font-medium rounded-lg transition-colors"
      >
        {busy ? stageLabel(stage) : 'Upload to Sia'}
      </button>
    </div>
  )
}

function stageLabel(s: Stage): string {
  switch (s) {
    case 'loading-tools':
      return 'Loading video tools…'
    case 'remuxing':
      return 'Remuxing to MP4…'
    case 'thumbnailing':
      return 'Extracting thumbnail…'
    case 'uploading':
      return 'Uploading shards…'
    case 'pinning':
      return 'Pinning to indexer…'
    case 'sharing':
      return 'Generating share URL…'
    case 'submitting':
      return 'Posting listing…'
    case 'done':
      return 'Done'
    case 'error':
      return 'Error'
    default:
      return ''
  }
}

// Map (stage, progress) onto a single 0..100 bar. Each stage occupies a
// chunk of the bar proportional to its expected duration. Approximate.
function barWidth(stage: Stage, frac: number, bytes: number, total: number): number {
  const bands: Array<[Stage, number]> = [
    ['loading-tools', 0.1],
    ['remuxing', 0.25],
    ['thumbnailing', 0.05],
    ['uploading', 0.5],
    ['pinning', 0.05],
    ['sharing', 0.025],
    ['submitting', 0.025],
  ]
  let acc = 0
  for (const [name, weight] of bands) {
    if (stage === name) {
      const inStage = stage === 'uploading' ? Math.min(1, bytes / Math.max(total, 1)) : frac
      return Math.min(100, (acc + weight * inStage) * 100)
    }
    acc += weight
  }
  return 100
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      resolve(dataUrl.split(',')[1] ?? '')
    }
    reader.onerror = () => reject(new Error('blob to base64 failed'))
    reader.readAsDataURL(blob)
  })
}
