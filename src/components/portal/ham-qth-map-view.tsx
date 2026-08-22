"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  LngLatBounds,
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  Popup,
  setWorkerUrl,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useTranslations } from "next-intl";
import {
  HamMapFloatingPanel,
  type HamMapViewer,
} from "@/components/portal/ham-map-floating-panel";
import { HamMapControlsPanel } from "@/components/portal/ham-map-controls-panel";
import {
  HAM_MAP_QTH_LIST_WIDTH_PX,
  HamMapQthListPanel,
} from "@/components/portal/ham-map-qth-list-panel";
import { QsoMapLoginDialog } from "@/components/portal/qso-map-login-dialog";
import {
  maidenheadBounds,
  maidenheadToLatLng,
  normalizeGrid,
  formatMaidenheadDisplay,
} from "@/lib/maidenhead";
import { qsoMapCallsignHref } from "@/lib/ham-reserved";
import {
  buildQthGridFeatureCollection,
  buildQthMarkerElement,
  escapeQthHtml,
  qthMapPopupClassName,
  setQthGridFocus,
  setQthGridVisibility,
  syncQthGridLayers,
  syncQthMarkerFocus,
} from "@/lib/map/ham-qth-map-layers";
import {
  getServerStoredGrid,
  readStoredHamMapGrid,
  subscribeHamMapLocation,
} from "@/lib/map/ham-map-location";
import {
  MAPLIBRE_WORKER_URL,
  mapTilerStyleUrl,
  readStoredHamMapTheme,
  writeStoredHamMapTheme,
  type HamMapTheme,
} from "@/lib/map/maptiler-style";
import type { PublicHamLocationStation } from "@/lib/qth-locations";

type Props = {
  mapTilerKey: string;
  stations: PublicHamLocationStation[];
  branding: { siteName: string; logoUrl?: string };
  viewer?: HamMapViewer | null;
  hasGoogleLogin?: boolean;
  loginCallbackUrl?: string;
};

/** Matches HamMapFloatingPanel max width (22rem) for fitBounds padding. */
const FLOATING_PANEL_ESTIMATE_PX = 360;

let mapLibreWorkerConfigured = false;

function ensureMapLibreWorker() {
  if (mapLibreWorkerConfigured) return;
  setWorkerUrl(MAPLIBRE_WORKER_URL);
  mapLibreWorkerConfigured = true;
}

function buildAllStationsBounds(
  stations: PublicHamLocationStation[],
): LngLatBounds | null {
  if (stations.length === 0) return null;

  const bounds = new LngLatBounds();
  for (const station of stations) {
    const { bounds: gridBounds, lat, lng } = station.homeMarker;
    bounds.extend([gridBounds.west, gridBounds.south]);
    bounds.extend([gridBounds.east, gridBounds.north]);
    bounds.extend([lng, lat]);
  }
  return bounds;
}

function buildStationBounds(station: PublicHamLocationStation): LngLatBounds {
  const { bounds: gridBounds, lat, lng } = station.homeMarker;
  const bounds = new LngLatBounds();
  bounds.extend([gridBounds.west, gridBounds.south]);
  bounds.extend([gridBounds.east, gridBounds.north]);
  bounds.extend([lng, lat]);
  return bounds;
}

function fitMapToBounds(
  map: MapLibreMap,
  bounds: LngLatBounds,
  listOpen: boolean,
  options?: { duration?: number; maxZoom?: number },
) {
  const container = map.getContainer();
  const width = container.clientWidth || 0;
  const height = container.clientHeight || 0;
  if (width < 80 || height < 80) return;

  const listPad = listOpen ? HAM_MAP_QTH_LIST_WIDTH_PX : 0;
  const maxPadX = Math.max(24, Math.floor(width / 2) - 32);
  const maxPadY = Math.max(24, Math.floor(height / 2) - 32);
  const leftObstruction = listPad + FLOATING_PANEL_ESTIMATE_PX + 16;
  const padding = {
    top: Math.min(120, maxPadY),
    bottom: Math.min(80, maxPadY),
    left: Math.min(Math.max(leftObstruction, listPad + 48), maxPadX),
    right: Math.min(120, maxPadX),
  };

  try {
    map.stop();
    map.fitBounds(bounds, {
      padding,
      maxZoom: options?.maxZoom ?? 10,
      duration: options?.duration ?? 800,
      essential: true,
    });
  } catch {
    map.fitBounds(bounds, {
      padding: 80,
      maxZoom: options?.maxZoom ?? 10,
      duration: options?.duration ?? 800,
    });
  }
}

function fitMapToAllStations(
  map: MapLibreMap,
  stations: PublicHamLocationStation[],
  listOpen: boolean,
  options?: { duration?: number; maxZoom?: number },
) {
  const bounds = buildAllStationsBounds(stations);
  if (!bounds) return;
  fitMapToBounds(map, bounds, listOpen, options);
}

export function HamQthMapView({
  mapTilerKey,
  stations,
  branding,
  viewer = null,
  hasGoogleLogin = false,
  loginCallbackUrl = "/qth",
}: Props) {
  const tMap = useTranslations("ham.map");
  const tQth = useTranslations("ham.qth");
  const shellRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const markersByCallsignRef = useRef(new Map<string, Marker>());
  const appliedThemeRef = useRef<HamMapTheme | null>(null);
  const hasFittedRef = useRef(false);
  const pendingPopupCallsignRef = useRef<string | null>(null);
  const qthListOpenRef = useRef(false);
  const selectedCallsignRef = useRef<string | null>(null);
  const fitAllStationsRef = useRef<
    (options?: { duration?: number; maxZoom?: number }) => void
  >(() => undefined);
  const focusStationRef = useRef<(callsign: string) => void>(() => undefined);
  const clearSelectionRef = useRef<(refit?: boolean) => void>(() => undefined);
  const handleSelectStationRef = useRef<(callsign: string | null) => void>(() => undefined);
  const [mapTheme, setMapTheme] = useState<HamMapTheme | null>(null);
  const themeReady = mapTheme !== null;
  const [qthListOpen, setQthListOpen] = useState(() => Boolean(viewer));
  const [selectedCallsign, setSelectedCallsign] = useState<string | null>(null);
  const [showGridRectangles, setShowGridRectangles] = useState(true);
  const [showLocationMarkers, setShowLocationMarkers] = useState(true);
  const [showCallsigns, setShowCallsigns] = useState(true);
  const [isBrowserFullscreen, setIsBrowserFullscreen] = useState(false);
  const [fullscreenSupported, setFullscreenSupported] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [guestGrid, setGuestGrid] = useState("");

  const storedGrid = useSyncExternalStore(
    subscribeHamMapLocation,
    readStoredHamMapGrid,
    getServerStoredGrid,
  );
  const profileGrid = viewer?.homeGrid.trim() || "";
  const overlayDisplayGrid = profileGrid || guestGrid || storedGrid;
  const panelTheme = mapTheme ?? "light";
  const hasMarkers = stations.length > 0;
  const listStations = viewer ? stations : [];
  const emptyBanner =
    panelTheme === "light"
      ? "border-zinc-300/80 bg-white/90 text-zinc-900 shadow-lg shadow-zinc-900/10"
      : "border-white/10 bg-black/70 text-white/90";
  const emptyMuted = panelTheme === "light" ? "text-zinc-500" : "text-white/70";

  const fitAllStations = useCallback(
    (options?: { duration?: number; maxZoom?: number }) => {
      const map = mapRef.current;
      if (!map || stations.length === 0) return;
      fitMapToAllStations(map, stations, qthListOpenRef.current, options);
    },
    [stations],
  );

  useEffect(() => {
    fitAllStationsRef.current = fitAllStations;
  }, [fitAllStations]);

  useEffect(() => {
    selectedCallsignRef.current = selectedCallsign;
  }, [selectedCallsign]);

  const openStationPopup = useCallback((callsign: string) => {
    pendingPopupCallsignRef.current = callsign;
    const marker = markersByCallsignRef.current.get(callsign);
    if (marker) {
      const popup = marker.getPopup();
      if (popup && !popup.isOpen()) {
        marker.togglePopup();
      }
      pendingPopupCallsignRef.current = null;
    }
  }, []);

  const closeOtherPopups = useCallback((exceptCallsign?: string) => {
    for (const [callsign, marker] of markersByCallsignRef.current) {
      if (exceptCallsign && callsign === exceptCallsign) continue;
      const popup = marker.getPopup();
      if (popup?.isOpen()) {
        marker.togglePopup();
      }
    }
  }, []);

  const closeAllPopups = useCallback(() => {
    closeOtherPopups();
  }, [closeOtherPopups]);

  const focusStation = useCallback(
    (callsign: string) => {
      const map = mapRef.current;
      const station = stations.find((item) => item.callsign === callsign);
      if (!map || !station) return;

      closeOtherPopups(callsign);
      pendingPopupCallsignRef.current = callsign;

      const openPopup = () => {
        openStationPopup(callsign);
      };
      map.once("moveend", openPopup);
      window.setTimeout(openPopup, 900);

      fitMapToBounds(map, buildStationBounds(station), qthListOpenRef.current, {
        maxZoom: 12,
        duration: 800,
      });
    },
    [closeOtherPopups, openStationPopup, stations],
  );

  useEffect(() => {
    focusStationRef.current = focusStation;
  }, [focusStation]);

  const clearSelection = useCallback(
    (refit = true) => {
      setSelectedCallsign(null);
      closeAllPopups();
      const map = mapRef.current;
      if (map?.isStyleLoaded()) {
        setQthGridFocus(map, null);
        syncQthMarkerFocus(markersByCallsignRef.current, null);
      }
      if (refit) {
        fitAllStations({ duration: 300 });
      }
    },
    [closeAllPopups, fitAllStations],
  );

  useEffect(() => {
    clearSelectionRef.current = clearSelection;
  }, [clearSelection]);

  const handleSelectStation = useCallback(
    (callsign: string | null) => {
      setSelectedCallsign(callsign);
      if (!callsign) {
        closeAllPopups();
        fitAllStations();
        return;
      }
      closeOtherPopups(callsign);
      focusStation(callsign);
    },
    [closeAllPopups, closeOtherPopups, fitAllStations, focusStation],
  );

  useEffect(() => {
    handleSelectStationRef.current = handleSelectStation;
  }, [handleSelectStation]);

  const focusOverlayGrid = useCallback(
    (grid: string) => {
      clearSelection(false);

      const map = mapRef.current;
      const normalized = normalizeGrid(grid);
      const square = maidenheadBounds(normalized);
      const center = maidenheadToLatLng(normalized);
      if (!square || !center) return;

      const station = stations.find(
        (item) => normalizeGrid(item.homeMarker.grid) === normalized,
      );
      if (station) {
        focusStation(station.callsign);
        return;
      }

      if (!map) return;
      const fitBounds = new LngLatBounds();
      fitBounds.extend([square.west, square.south]);
      fitBounds.extend([square.east, square.north]);
      fitBounds.extend([center.lng, center.lat]);
      fitMapToBounds(map, fitBounds, qthListOpenRef.current, { maxZoom: 12 });
    },
    [clearSelection, focusStation, stations],
  );

  useEffect(() => {
    qthListOpenRef.current = qthListOpen;
    if (!qthListOpen && selectedCallsignRef.current) {
      clearSelectionRef.current(true);
      return;
    }
    if (selectedCallsignRef.current) {
      focusStationRef.current(selectedCallsignRef.current);
      return;
    }
    fitAllStationsRef.current({ duration: 300 });
  }, [qthListOpen]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || stations.length === 0) return;

    const refit = () => {
      if (selectedCallsignRef.current) return;
      fitAllStationsRef.current({ duration: 0 });
    };

    map.on("resize", refit);
    window.addEventListener("resize", refit);
    return () => {
      map.off("resize", refit);
      window.removeEventListener("resize", refit);
    };
  }, [stations.length, themeReady]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setFullscreenSupported(
        typeof document.documentElement.requestFullscreen === "function",
      );
    });

    function onFullscreenChange() {
      const shell = shellRef.current;
      setIsBrowserFullscreen(Boolean(shell && document.fullscreenElement === shell));
      requestAnimationFrame(() => {
        mapRef.current?.resize();
        fitAllStationsRef.current({ duration: 0 });
      });
    }

    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, []);

  useEffect(() => {
    document.body.classList.add("ham-map-view");
    const frame = window.requestAnimationFrame(() => {
      setMapTheme(readStoredHamMapTheme());
    });
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.classList.remove("ham-map-view");
    };
  }, []);

  useEffect(() => {
    if (!mapTilerKey || !mapTheme || !containerRef.current || mapRef.current) {
      return;
    }

    ensureMapLibreWorker();

    const map = new MapLibreMap({
      container: containerRef.current,
      style: mapTilerStyleUrl(mapTheme, mapTilerKey),
      center: [105.8, 16],
      zoom: 5,
      attributionControl: {},
    });

    map.addControl(new NavigationControl(), "bottom-right");
    mapRef.current = map;
    appliedThemeRef.current = mapTheme;

    const onLoad = () => map.resize();
    map.on("load", onLoad);
    requestAnimationFrame(() => map.resize());

    const markersByCallsign = markersByCallsignRef.current;

    return () => {
      map.off("load", onLoad);
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      markersByCallsign.clear();
      map.remove();
      mapRef.current = null;
      appliedThemeRef.current = null;
      hasFittedRef.current = false;
      pendingPopupCallsignRef.current = null;
    };
    // Create once after the client theme is known; later theme changes use setStyle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapTilerKey, themeReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapTilerKey || !mapTheme) return;
    if (appliedThemeRef.current === mapTheme) return;

    const applyStyle = () => {
      if (appliedThemeRef.current === mapTheme) return;
      appliedThemeRef.current = mapTheme;
      map.setStyle(mapTilerStyleUrl(mapTheme, mapTilerKey));
    };

    if (map.isStyleLoaded()) {
      applyStyle();
      return;
    }

    map.once("load", applyStyle);
    return () => {
      map.off("load", applyStyle);
    };
  }, [mapTheme, mapTilerKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapTilerKey || !themeReady) return;

    const applyMapContent = (fitCamera: boolean) => {
      const viewerCallsign = viewer?.callsign.trim().toUpperCase() ?? "";
      const gridEntries = stations.map((station) => {
        const isViewer =
          Boolean(viewerCallsign) && station.callsign === viewerCallsign;
        const kind = isViewer ? ("viewer" as const) : ("station" as const);
        return {
          marker: station.homeMarker,
          kind,
          label: formatMaidenheadDisplay(station.homeMarker.grid),
          callsign: station.callsign,
        };
      });

      syncQthGridLayers(
        map,
        buildQthGridFeatureCollection(gridEntries),
        panelTheme,
      );
      setQthGridVisibility(map, showGridRectangles);
      setQthGridFocus(map, selectedCallsignRef.current);

      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      markersByCallsignRef.current.clear();

      if (showLocationMarkers) {
        for (const station of stations) {
          const { homeMarker } = station;
          const isViewer =
            Boolean(viewerCallsign) && station.callsign === viewerCallsign;
          const kind = isViewer ? ("viewer" as const) : ("station" as const);
          const pinLabel = showCallsigns
            ? isViewer
              ? tQth("yourLocationLabel", { callsign: station.callsign })
              : station.callsign
            : "";
          const el = buildQthMarkerElement(pinLabel, panelTheme, kind);
          const qsoMapHref = qsoMapCallsignHref(station.callsign);
          const popupTitle = isViewer
            ? tQth("yourLocationLabel", { callsign: station.callsign })
            : station.callsign;
          const marker = new Marker({ element: el })
            .setLngLat([homeMarker.lng, homeMarker.lat])
            .setPopup(
              new Popup({
                offset: 12,
                className: qthMapPopupClassName(panelTheme),
                closeButton: true,
                closeOnClick: false,
              }).setHTML(
                `<strong>${escapeQthHtml(popupTitle)}</strong>${
                  station.verified && !isViewer
                    ? ` <span style="font-size:11px;opacity:0.75">(${escapeQthHtml(tQth("verified"))})</span>`
                    : ""
                }<br/>${escapeQthHtml(station.name)}<br/>${escapeQthHtml(
                  tQth("gridLabel"),
                )}: ${escapeQthHtml(formatMaidenheadDisplay(homeMarker.grid))}<br/><a href="${escapeQthHtml(qsoMapHref)}" style="font-size:12px;margin-top:4px;display:inline-block">${escapeQthHtml(tQth("viewProfile"))}</a>`,
              ),
            )
            .addTo(map);

          const element = marker.getElement();
          element.addEventListener("click", (event) => {
            event.stopPropagation();
            const callsign = station.callsign;
            if (selectedCallsignRef.current === callsign) {
              marker.togglePopup();
              return;
            }
            handleSelectStationRef.current(callsign);
          });
          markersRef.current.push(marker);
          markersByCallsignRef.current.set(station.callsign, marker);
        }
      }

      syncQthMarkerFocus(
        markersByCallsignRef.current,
        selectedCallsignRef.current,
      );

      const pendingPopup = pendingPopupCallsignRef.current;
      if (pendingPopup) {
        markersByCallsignRef.current.get(pendingPopup)?.togglePopup();
        pendingPopupCallsignRef.current = null;
      }

      if (fitCamera && stations.length > 0) {
        fitMapToAllStations(map, stations, qthListOpenRef.current, {
          duration: 0,
          maxZoom: 10,
        });
        hasFittedRef.current = true;
      }
    };

    const onStyleLoad = () => {
      hasFittedRef.current = false;
      applyMapContent(true);
    };

    if (map.isStyleLoaded()) {
      applyMapContent(!hasFittedRef.current);
    }

    map.on("load", onStyleLoad);
    map.on("style.load", onStyleLoad);
    return () => {
      map.off("load", onStyleLoad);
      map.off("style.load", onStyleLoad);
    };
  }, [
    stations,
    showGridRectangles,
    showLocationMarkers,
    showCallsigns,
    panelTheme,
    mapTilerKey,
    themeReady,
    tQth,
    viewer?.callsign,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !themeReady || !map.isStyleLoaded()) return;
    setQthGridFocus(map, selectedCallsign);
    syncQthMarkerFocus(markersByCallsignRef.current, selectedCallsign);
  }, [selectedCallsign, themeReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapTilerKey || !themeReady) return;

    const onMapClick = (event: {
      originalEvent?: Event;
    }) => {
      const target = event.originalEvent?.target;
      if (
        target instanceof Element &&
        target.closest(".maplibregl-marker, .maplibregl-popup, .ham-map-popup")
      ) {
        return;
      }

      if (!selectedCallsignRef.current) return;

      clearSelectionRef.current(true);
    };

    map.on("click", onMapClick);
    return () => {
      map.off("click", onMapClick);
    };
  }, [mapTilerKey, themeReady]);

  function onMapThemeChange(theme: HamMapTheme) {
    writeStoredHamMapTheme(theme);
    setMapTheme(theme);
  }

  async function toggleBrowserFullscreen() {
    const shell = shellRef.current;
    if (!shell) return;
    try {
      if (document.fullscreenElement === shell) {
        await document.exitFullscreen();
      } else {
        await shell.requestFullscreen();
      }
    } catch {
      // Browser may deny fullscreen without a user gesture or support.
    }
  }

  if (!mapTilerKey) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950 p-6 pl-[min(100%,23rem)]">
        <div className="max-w-md rounded-xl border border-white/10 bg-black/60 px-6 py-5 text-center text-white shadow-lg backdrop-blur-md">
          <p className="text-lg font-medium">{tMap("mapUnavailable")}</p>
          <p className="mt-2 text-sm text-white/70">{tMap("mapUnavailableHint")}</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={shellRef} className="fixed inset-0 z-[100] bg-zinc-200">
      <div
        ref={containerRef}
        className="h-full w-full"
        aria-label={tQth("title")}
      />

      <HamMapFloatingPanel
        viewer={viewer}
        branding={branding}
        mapTheme={panelTheme}
        themeReady={themeReady}
        onMapThemeChange={onMapThemeChange}
        showLogbookPrivateNotice={false}
        mapAvailable={Boolean(mapTilerKey)}
        showCallsignLookup={false}
        offsetLeft={qthListOpen ? HAM_MAP_QTH_LIST_WIDTH_PX : 0}
        onLoginClick={viewer ? undefined : () => setLoginOpen(true)}
        onFocusGrid={focusOverlayGrid}
        guestGrid={overlayDisplayGrid}
        onGuestGrid={(grid) => setGuestGrid(grid)}
      />

      <HamMapQthListPanel
        mapTheme={panelTheme}
        open={qthListOpen}
        onOpenChange={setQthListOpen}
        stations={listStations}
        selectedCallsign={selectedCallsign}
        viewerCallsign={viewer?.callsign}
        onSelectStation={handleSelectStation}
        guestList={!viewer}
      />

      <div className="pointer-events-none absolute right-3 top-3 z-20 flex flex-col items-end gap-2">
        <HamMapControlsPanel
          mapTheme={panelTheme}
          showGridRectangles={showGridRectangles}
          onToggleGridRectangles={() =>
            setShowGridRectangles((current) => !current)
          }
          showLocationMarkers={showLocationMarkers}
          onToggleLocationMarkers={() =>
            setShowLocationMarkers((current) => !current)
          }
          showCallsigns={showCallsigns}
          onToggleCallsigns={() => setShowCallsigns((current) => !current)}
          showTraces={false}
          onToggleTraces={() => undefined}
          tracesAvailable={false}
          isBrowserFullscreen={isBrowserFullscreen}
          onToggleBrowserFullscreen={() => {
            void toggleBrowserFullscreen();
          }}
          fullscreenSupported={fullscreenSupported}
        />
      </div>

      <QsoMapLoginDialog
        open={loginOpen}
        hasGoogle={hasGoogleLogin}
        onClose={() => setLoginOpen(false)}
        callbackUrl={loginCallbackUrl}
      />

      {!hasMarkers ? (
        <div
          className={`absolute bottom-6 left-1/2 z-20 w-[min(92vw,28rem)] -translate-x-1/2 rounded-xl border px-4 py-3 text-center text-sm backdrop-blur-md ${emptyBanner} ${
            viewer ? "pointer-events-none" : "pointer-events-auto"
          }`}
        >
          <p className="font-medium">
            {viewer ? tQth("emptyTitle") : tQth("guestEmptyTitle")}
          </p>
          <p className={`mt-1 text-xs ${emptyMuted}`}>
            {viewer ? tQth("emptyMessage") : tQth("guestEmptyMessage")}
          </p>
          {!viewer ? (
            <button
              type="button"
              onClick={() => setLoginOpen(true)}
              className={`mt-3 rounded-md border px-3 py-1.5 text-xs font-medium transition ${
                panelTheme === "light"
                  ? "border-zinc-300 bg-white hover:bg-zinc-50"
                  : "border-white/15 bg-white/5 hover:bg-white/10"
              }`}
            >
              {tMap("lookupSignIn")}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
