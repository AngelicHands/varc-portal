import Hls from "hls.js";

/** True when the URL looks like an HLS playlist (.m3u8). */
export function isHlsPlaylistUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    return /\.m3u8($|\?|#)/i.test(`${url.pathname}${url.search}${url.hash}`);
  } catch {
    return false;
  }
}

export type HlsAttachment = {
  destroy: () => void;
  /**
   * Ensure the playlist is attached/loaded, then play.
   * Pass `{ muted: true }` in editor previews so play() still works after
   * the network wait (browsers consume the click gesture by then).
   */
  play: (options?: { muted?: boolean }) => Promise<void>;
};

/**
 * Attach an HLS (m3u8) source to a video element.
 * Uses native HLS on Safari; hls.js elsewhere.
 */
export function attachHlsSource(
  video: HTMLVideoElement,
  src: string,
): HlsAttachment {
  const url = src.trim();
  if (!url) {
    return {
      destroy: () => undefined,
      play: async () => {
        throw new Error("Missing HLS playlist URL");
      },
    };
  }

  const playVideo = async (options?: { muted?: boolean }) => {
    if (options?.muted) {
      video.muted = true;
      video.defaultMuted = true;
    }
    await video.play();
  };

  // Safari / iOS: native HLS
  if (video.canPlayType("application/vnd.apple.mpegurl")) {
    video.src = url;
    return {
      destroy: () => {
        video.removeAttribute("src");
        video.load();
      },
      play: async (options) => {
        if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
          await new Promise<void>((resolve, reject) => {
            const onLoaded = () => {
              cleanup();
              resolve();
            };
            const onError = () => {
              cleanup();
              reject(new Error("Failed to load HLS media"));
            };
            const cleanup = () => {
              video.removeEventListener("loadeddata", onLoaded);
              video.removeEventListener("canplay", onLoaded);
              video.removeEventListener("error", onError);
            };
            video.addEventListener("loadeddata", onLoaded);
            video.addEventListener("canplay", onLoaded);
            video.addEventListener("error", onError);
            // Kick the element in case the browser deferred loading.
            video.load();
          });
        }
        await playVideo(options);
      },
    };
  }

  if (Hls.isSupported()) {
    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: false,
      autoStartLoad: true,
    });

    let resolveManifest: (() => void) | undefined;
    let rejectManifest: ((error: Error) => void) | undefined;
    let manifestSettled = false;

    const manifestReady = new Promise<void>((resolve, reject) => {
      resolveManifest = resolve;
      rejectManifest = reject;
    });

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      if (manifestSettled) return;
      manifestSettled = true;
      resolveManifest?.();
    });
    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (!data.fatal || manifestSettled) {
        // Non-fatal / already settled: ignore for readiness.
        return;
      }
      manifestSettled = true;
      rejectManifest?.(
        new Error(
          data.details
            ? `HLS error: ${data.details}`
            : "Failed to load HLS playlist",
        ),
      );
    });

    hls.loadSource(url);
    hls.attachMedia(video);

    return {
      destroy: () => {
        hls.destroy();
      },
      play: async (options) => {
        await manifestReady;
        await playVideo(options);
      },
    };
  }

  video.src = url;
  return {
    destroy: () => {
      video.removeAttribute("src");
      video.load();
    },
    play: async (options) => {
      await playVideo(options);
    },
  };
}

/** Find and attach HLS players under a root element. Returns cleanup. */
export function attachHlsVideosInRoot(root: ParentNode): () => void {
  const cleanups: Array<() => void> = [];
  root
    .querySelectorAll<HTMLVideoElement>("video[data-hls-src]")
    .forEach((video) => {
      if (video.dataset.hlsAttached === "1") return;
      const src = video.getAttribute("data-hls-src")?.trim();
      if (!src) return;
      video.dataset.hlsAttached = "1";
      const attachment = attachHlsSource(video, src);
      cleanups.push(() => {
        attachment.destroy();
        delete video.dataset.hlsAttached;
      });
    });
  return () => {
    cleanups.forEach((fn) => fn());
  };
}
