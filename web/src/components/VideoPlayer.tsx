import type { PinnedObject, Sdk } from '@siafoundation/sia-storage'
import { useEffect, useRef, useState } from 'react'
import { MseController, type MseProgress } from '../lib/mse'
import { formatBytes } from '../lib/format'

export function VideoPlayer({
  obj,
  sdk,
  poster,
}: {
  obj: PinnedObject
  sdk: Sdk
  poster?: string
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [progress, setProgress] = useState<MseProgress>({ bytesFetched: 0, totalBytes: 0 })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const ctrl = new MseController(video, obj, sdk, setProgress)
    let cancelled = false

    ctrl.start().catch((e) => {
      if (cancelled) return
      console.error('[VideoPlayer] start error:', e)
      setError(e instanceof Error ? e.message : String(e))
    })

    return () => {
      cancelled = true
      ctrl.destroy()
    }
  }, [obj, sdk])

  const buffering =
    progress.totalBytes > 0 && progress.bytesFetched < progress.totalBytes

  return (
    <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
      <video
        ref={videoRef}
        controls
        playsInline
        poster={poster}
        className="w-full h-full"
      />
      {buffering && !error && (
        <div className="absolute top-2 right-2 px-2 py-1 rounded bg-black/70 text-white text-[11px] font-mono tabular-nums backdrop-blur-sm">
          Buffering · {formatBytes(progress.bytesFetched)} / {formatBytes(progress.totalBytes)}
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/85 text-white p-6 text-center gap-2">
          <p className="text-sm font-medium">Couldn&apos;t play this video</p>
          <p className="text-xs text-white/70 max-w-sm">{error}</p>
          <p className="text-xs text-white/50 mt-2">
            The original file may use a codec the browser&apos;s MediaSource can&apos;t decode.
          </p>
        </div>
      )}
    </div>
  )
}
