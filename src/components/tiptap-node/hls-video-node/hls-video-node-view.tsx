"use client"

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react"
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react"
import {
  attachHlsSource,
  type HlsAttachment,
} from "@/lib/hls-player"

/**
 * Editor preview for HLS: selecting the block does not play.
 * Only the dedicated play control starts playback.
 */
export function HlsVideoNodeView({ node, selected }: NodeViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const attachmentRef = useRef<HlsAttachment | null>(null)
  const src = String(node.attrs.src ?? "").trim()
  const poster = node.attrs.poster ? String(node.attrs.poster) : undefined
  const title = String(node.attrs.title ?? "").trim()
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    setPlaying(false)
    setLoading(false)
    setError("")
    attachmentRef.current?.destroy()
    attachmentRef.current = null

    const video = videoRef.current
    if (video) {
      video.removeAttribute("src")
      video.load()
    }

    return () => {
      attachmentRef.current?.destroy()
      attachmentRef.current = null
    }
  }, [src])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const onPlaying = () => {
      setPlaying(true)
      setLoading(false)
      setError("")
    }
    const onPause = () => setPlaying(false)
    const onEnded = () => setPlaying(false)

    video.addEventListener("playing", onPlaying)
    video.addEventListener("pause", onPause)
    video.addEventListener("ended", onEnded)

    return () => {
      video.removeEventListener("playing", onPlaying)
      video.removeEventListener("pause", onPause)
      video.removeEventListener("ended", onEnded)
    }
  }, [src])

  const startPlayback = useCallback(
    async (event: ReactMouseEvent) => {
      // Don't let TipTap treat this as a node selection gesture.
      event.stopPropagation()

      const video = videoRef.current
      if (!video || !src || loading) return

      setLoading(true)
      setError("")

      try {
        if (!attachmentRef.current) {
          attachmentRef.current = attachHlsSource(video, src)
        }
        // Editor preview must be muted: waiting for the playlist clears the
        // click gesture, and unmuted play() is then blocked by the browser.
        await attachmentRef.current.play({ muted: true })
        setPlaying(true)
      } catch (err) {
        setPlaying(false)
        setError(
          err instanceof Error && err.message
            ? err.message
            : "Could not play this HLS stream",
        )
        attachmentRef.current?.destroy()
        attachmentRef.current = null
      } finally {
        setLoading(false)
      }
    },
    [src, loading],
  )

  return (
    <NodeViewWrapper
      as="figure"
      className={`content-hls${selected ? " ProseMirror-selectednode" : ""}`}
      data-type="hls-video"
      data-drag-handle
      contentEditable={false}
    >
      <div className="content-hls-frame">
        <video
          ref={videoRef}
          className="content-hls-video"
          data-hls-src={src}
          controls={playing}
          controlsList="nodownload"
          playsInline
          preload="none"
          poster={poster}
          title={title || undefined}
          // Surface clicks select the node; native controls only after play starts.
          style={{ pointerEvents: playing ? "auto" : "none" }}
          onDoubleClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
          }}
        />

        {!playing ? (
          <button
            type="button"
            className="content-hls-play"
            aria-label={loading ? "Loading HLS video" : "Play HLS video"}
            disabled={!src || loading}
            // stopPropagation only — avoid preventDefault so the click stays trusted for play().
            onMouseDown={(event) => event.stopPropagation()}
            onClick={startPlayback}
          >
            {loading ? (
              <span className="content-hls-play__spinner" aria-hidden />
            ) : (
              <span className="content-hls-play__icon" aria-hidden />
            )}
          </button>
        ) : null}
      </div>

      {title ? (
        <figcaption className="content-figcaption">{title}</figcaption>
      ) : null}
      {error ? (
        <p className="content-hls-error" role="alert">
          {error}
        </p>
      ) : null}
      {!src ? (
        <p className="content-hls-placeholder">Missing HLS playlist URL</p>
      ) : !error ? (
        <p className="content-hls-hint">
          {loading
            ? "Loading stream…"
            : playing
              ? "Playing muted preview — unmute in the video controls"
              : selected
                ? "Selected — click ▶ to preview"
                : "Click the block to select, or ▶ to preview"}
        </p>
      ) : null}
    </NodeViewWrapper>
  )
}
