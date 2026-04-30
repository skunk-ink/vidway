// MSE-based streaming controller. Pulls ranged downloads from Sia and
// feeds them sequentially into a SourceBuffer.
//
// Sequential, not seek-anywhere. We append byte ranges in order from
// offset 0 onward, so MSE always sees a continuous stream of fMP4 boxes
// and never has to handle a mid-fragment append. Trade-off: the user
// can seek freely *within already-buffered* time, but seeking past the
// buffer just pauses until the streamer catches up. Real seek-anywhere
// would need fMP4 box parsing (mp4box.js) or pre-segmented HLS — both
// out of scope for Phase 2.

import type { PinnedObject, Sdk } from '@siafoundation/sia-storage'

const CHUNK_SIZE = 4 * 1024 * 1024 // 4 MiB per range fetch
const PREBUFFER_SIZE = 2 * 1024 * 1024 // 2 MiB initial pull before play
const TARGET_BUFFER_SECONDS = 30 // try to keep ~30s ahead of the playhead

// H.264 High Profile @ Level 4.0 + AAC LC. Permissive umbrella — any
// H.264 source produced by the typical phone/desktop encoder falls
// under this. HEVC/VP9/AV1 sources won't match and `addSourceBuffer`
// will throw with NotSupportedError; the caller surfaces that.
const CODEC = 'video/mp4; codecs="avc1.640028,mp4a.40.2"'

export type MseProgress = {
  bytesFetched: number
  totalBytes: number
}

export class MseController {
  private mediaSource: MediaSource
  private sourceBuffer: SourceBuffer | null = null
  private totalSize: number
  private fetchedTo = 0
  private fetching = false
  private destroyed = false
  private url: string | null = null
  private video: HTMLVideoElement
  private obj: PinnedObject
  private sdk: Sdk
  private onProgress?: (p: MseProgress) => void

  constructor(
    video: HTMLVideoElement,
    obj: PinnedObject,
    sdk: Sdk,
    onProgress?: (p: MseProgress) => void,
  ) {
    this.video = video
    this.obj = obj
    this.sdk = sdk
    this.onProgress = onProgress
    this.totalSize = Number(obj.size())
    this.mediaSource = new MediaSource()
  }

  async start(): Promise<void> {
    if (typeof MediaSource === 'undefined') {
      throw new Error('MediaSource Extensions are not supported in this browser')
    }
    if (!MediaSource.isTypeSupported(CODEC)) {
      throw new Error(`Browser does not support codec: ${CODEC}`)
    }

    this.url = URL.createObjectURL(this.mediaSource)
    this.video.src = this.url

    // sourceopen fires once the <video> element has attached the
    // MediaSource. We can only addSourceBuffer after that.
    await new Promise<void>((resolve) => {
      const onOpen = () => {
        this.mediaSource.removeEventListener('sourceopen', onOpen)
        resolve()
      }
      this.mediaSource.addEventListener('sourceopen', onOpen)
    })

    if (this.destroyed) return

    try {
      this.sourceBuffer = this.mediaSource.addSourceBuffer(CODEC)
    } catch (e) {
      throw new Error(
        e instanceof Error
          ? `Could not create source buffer (${e.message}). The video's codec may not be supported.`
          : 'Could not create source buffer',
      )
    }
    this.sourceBuffer.mode = 'segments'

    this.video.addEventListener('timeupdate', this.onTimeUpdate)
    this.video.addEventListener('seeking', this.onSeeking)

    // Fetch the initial pre-buffer, then keep going as needed.
    await this.fetchNext(PREBUFFER_SIZE)
    this.maybeFetchMore()
  }

  destroy(): void {
    this.destroyed = true
    this.video.removeEventListener('timeupdate', this.onTimeUpdate)
    this.video.removeEventListener('seeking', this.onSeeking)
    try {
      if (this.mediaSource.readyState === 'open') {
        this.mediaSource.endOfStream()
      }
    } catch {
      // Best-effort. endOfStream throws if a buffer is still updating;
      // the GC'd MediaSource will clean up regardless.
    }
    if (this.url) {
      try {
        URL.revokeObjectURL(this.url)
      } catch {
        // ignore
      }
      this.url = null
    }
  }

  private onTimeUpdate = () => {
    this.maybeFetchMore()
  }

  private onSeeking = () => {
    // Sequential streamer can't satisfy a forward seek into unfetched
    // data — we just keep fetching forward, the player will resume
    // when the playhead's region is buffered.
    this.maybeFetchMore()
  }

  private maybeFetchMore(): void {
    if (this.fetching || this.destroyed) return
    if (this.fetchedTo >= this.totalSize) return
    if (!this.sourceBuffer) return

    const buffered = this.video.buffered
    let bufferEnd = 0
    for (let i = 0; i < buffered.length; i++) {
      if (buffered.end(i) > bufferEnd) bufferEnd = buffered.end(i)
    }
    const ahead = bufferEnd - this.video.currentTime

    // Always fetch if the buffer is nearly empty, even when we don't
    // have a meaningful currentTime yet (e.g. right after start).
    if (ahead < TARGET_BUFFER_SECONDS) {
      void this.fetchNext(CHUNK_SIZE).catch((err) => {
        console.error('[mse] fetch error:', err)
      })
    }
  }

  private async fetchNext(size: number): Promise<void> {
    if (this.fetching || this.destroyed) return
    if (!this.sourceBuffer) return
    if (this.fetchedTo >= this.totalSize) return

    this.fetching = true
    try {
      const offset = this.fetchedTo
      const length = Math.min(size, this.totalSize - offset)

      // Pull the byte range from Sia. Each call is a real ranged
      // download — the SDK fetches the encrypted shards covering this
      // range, decodes erasure-coded data, decrypts, and yields the
      // plaintext bytes through the ReadableStream.
      const stream = this.sdk.download(this.obj, { offset, length })
      const bytes = new Uint8Array(await new Response(stream).arrayBuffer())

      if (this.destroyed) return

      // Wait for any in-flight append to finish, then append our chunk.
      await waitForIdle(this.sourceBuffer)
      await appendBuffer(this.sourceBuffer, bytes)

      this.fetchedTo = offset + length
      this.onProgress?.({ bytesFetched: this.fetchedTo, totalBytes: this.totalSize })

      if (this.fetchedTo >= this.totalSize) {
        if (this.mediaSource.readyState === 'open') {
          try {
            this.mediaSource.endOfStream()
          } catch {
            // already ended / closed — nothing to do
          }
        }
      }
    } finally {
      this.fetching = false
      // Tail-call: keep filling the buffer until target is met or EOF.
      if (!this.destroyed) this.maybeFetchMore()
    }
  }
}

function waitForIdle(sb: SourceBuffer): Promise<void> {
  if (!sb.updating) return Promise.resolve()
  return new Promise((resolve) => {
    const onUpdateEnd = () => {
      sb.removeEventListener('updateend', onUpdateEnd)
      resolve()
    }
    sb.addEventListener('updateend', onUpdateEnd)
  })
}

function appendBuffer(sb: SourceBuffer, bytes: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    const onUpdateEnd = () => {
      cleanup()
      resolve()
    }
    const onError = () => {
      cleanup()
      reject(new Error('SourceBuffer error during appendBuffer'))
    }
    const cleanup = () => {
      sb.removeEventListener('updateend', onUpdateEnd)
      sb.removeEventListener('error', onError)
    }
    sb.addEventListener('updateend', onUpdateEnd)
    sb.addEventListener('error', onError)
    try {
      sb.appendBuffer(bytes as BufferSource)
    } catch (e) {
      cleanup()
      reject(e)
    }
  })
}
