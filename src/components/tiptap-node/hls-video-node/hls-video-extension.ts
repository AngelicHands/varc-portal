import { mergeAttributes, Node } from "@tiptap/core"
import { ReactNodeViewRenderer } from "@tiptap/react"
import { HlsVideoNodeView } from "@/components/tiptap-node/hls-video-node/hls-video-node-view"

export type HlsVideoAttrs = {
  src: string
  poster?: string | null
  title?: string | null
}

declare module "@tiptap/react" {
  interface Commands<ReturnType> {
    hlsVideo: {
      setHlsVideo: (attrs: HlsVideoAttrs) => ReturnType
    }
  }
}

function readVideoAttrs(element: HTMLElement): HlsVideoAttrs | false {
  const video =
    element.tagName === "VIDEO"
      ? element
      : element.querySelector("video")
  if (!video) return false

  const src =
    video.getAttribute("data-hls-src") ||
    video.getAttribute("src") ||
    ""
  if (!src.trim()) return false

  const caption = element.querySelector("figcaption")?.textContent?.trim()
  return {
    src: src.trim(),
    poster: video.getAttribute("poster") || null,
    title: caption || video.getAttribute("title") || null,
  }
}

/**
 * Block node for HLS (m3u8) video embeds.
 * Persists as <figure data-type="hls-video"><video data-hls-src="…"></video></figure>
 */
export const HlsVideo = Node.create({
  name: "hlsVideo",

  group: "block",

  atom: true,

  draggable: true,

  selectable: true,

  addAttributes() {
    return {
      src: {
        default: null,
      },
      poster: {
        default: null,
      },
      title: {
        default: null,
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'figure[data-type="hls-video"]',
        getAttrs: (node) => {
          if (!(node instanceof HTMLElement)) return false
          return readVideoAttrs(node)
        },
      },
      {
        tag: "video[data-hls-src]",
        getAttrs: (node) => {
          if (!(node instanceof HTMLElement)) return false
          return readVideoAttrs(node)
        },
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    const src = String(HTMLAttributes.src ?? "").trim()
    const poster = HTMLAttributes.poster
      ? String(HTMLAttributes.poster)
      : undefined
    const title = String(HTMLAttributes.title ?? "").trim()

    const videoAttrs = mergeAttributes(
      {
        class: "content-hls-video",
        "data-hls-src": src,
        controls: "controls",
        playsinline: "playsinline",
        preload: "metadata",
      },
      poster ? { poster } : {},
      title ? { title } : {},
    )

    // Strip TipTap-only attrs from leaking onto the video element.
    delete videoAttrs.src

    const figureAttrs = {
      class: "content-hls",
      "data-type": "hls-video",
    }

    if (title) {
      return [
        "figure",
        figureAttrs,
        ["video", videoAttrs],
        ["figcaption", { class: "content-figcaption" }, title],
      ]
    }

    return ["figure", figureAttrs, ["video", videoAttrs]]
  },

  addCommands() {
    return {
      setHlsVideo:
        (attrs) =>
        ({ commands }) => {
          const src = attrs.src?.trim()
          if (!src) return false
          return commands.insertContent({
            type: this.name,
            attrs: {
              src,
              poster: attrs.poster?.trim() || null,
              title: attrs.title?.trim() || null,
            },
          })
        },
    }
  },

  addNodeView() {
    return ReactNodeViewRenderer(HlsVideoNodeView, {
      className: "content-hls-node",
    })
  },
})

export default HlsVideo
