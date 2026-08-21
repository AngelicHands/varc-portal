"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  GeoJSONSource,
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
  MAPLIBRE_WORKER_URL,
  mapTilerStyleUrl,
  readStoredHamMapTheme,
  writeStoredHamMapTheme,
  type HamMapTheme,
} from "@/lib/map/maptiler-style";
import type { QsoListItemDto } from "@/lib/account-types";
import type { HomeGridMarker, QsoGridMarker } from "@/lib/qso-map";
import {
  aggregateQsoGridMarkers,
  buildQsoTraceFeatureCollection,
  filterQsosByTimeRange,
  type HamMapQsoTimeRange,
  type QsoTraceFeatureCollection,
} from "@/lib/qso-map";
import { HamMapFloatingPanel } from "@/components/portal/ham-map-floating-panel";
import { HamMapTour, HamMapTourHelpButton } from "@/components/portal/ham-map-tour";
import { HamMapControlsPanel } from "@/components/portal/ham-map-controls-panel";
import { HamMapQsoTimeFilter } from "@/components/portal/ham-map-qso-time-filter";
import {
  HAM_MAP_QSO_LIST_WIDTH_PX,
  HamMapQsoListPanel,
} from "@/components/portal/ham-map-qso-list-panel";
import { HamMapHomeLocationPrompt } from "@/components/portal/ham-map-home-location-prompt";
import type { MaidenheadBounds } from "@/lib/maidenhead";
import {
  formatMaidenheadDisplay,
  latLngToMaidenhead,
  maidenheadBounds,
  maidenheadToLatLng,
  normalizeGrid,
  pointInMaidenheadBounds,
  truncateMaidenhead,
} from "@/lib/maidenhead";
import { formatQsoDateTime } from "@/lib/qso-datetime";

const GRID_SOURCE_ID = "ham-grid-squares";
const GRID_FILL_LAYER_ID = "ham-grid-squares-fill";
const GRID_LINE_LAYER_ID = "ham-grid-squares-line";
const GRID_LABEL_LAYER_ID = "ham-grid-squares-label";
const TRACE_SOURCE_ID = "ham-qso-traces";
const TRACE_LAYER_ID = "ham-qso-traces-line";
const TRACE_LABEL_LAYER_ID = "ham-qso-traces-label";

type GridFeatureProps = {
  kind: "home" | "qso" | "pick";
  grid: string;
  label: string;
};

type PickedGrid = {
  grid: string;
  bounds: MaidenheadBounds;
  lat: number;
  lng: number;
};

type GridFeatureCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: GridFeatureProps;
    geometry:
      | {
          type: "Polygon";
          coordinates: [number, number][][];
        }
      | {
          type: "Point";
          coordinates: [number, number];
        };
  }>;
};

function boundsToCoordinates(
  bounds: MaidenheadBounds,
): [number, number][][] {
  const { west, south, east, north } = bounds;
  return [
    [
      [west, south],
      [east, south],
      [east, north],
      [west, north],
      [west, south],
    ],
  ];
}

/** Northwest corner — top-left of the square with north-up maps. */
function boundsTopLeft(bounds: MaidenheadBounds): [number, number] {
  return [bounds.west, bounds.north];
}

function pushGridFeatures(
  features: GridFeatureCollection["features"],
  props: GridFeatureProps,
  bounds: MaidenheadBounds,
) {
  features.push({
    type: "Feature",
    properties: props,
    geometry: {
      type: "Polygon",
      coordinates: boundsToCoordinates(bounds),
    },
  });
  features.push({
    type: "Feature",
    properties: props,
    geometry: {
      type: "Point",
      coordinates: boundsTopLeft(bounds),
    },
  });
}

function buildGridFeatureCollection(
  homeMarker: HomeGridMarker | null,
  qsoMarkers: QsoGridMarker[],
  showQsoMarkers: boolean,
  homeLabel: string,
  picked: PickedGrid | null,
  pickedLabel: string,
): GridFeatureCollection {
  const features: GridFeatureCollection["features"] = [];

  if (homeMarker) {
    const gridLabel = formatMaidenheadDisplay(homeMarker.grid);
    pushGridFeatures(
      features,
      {
        kind: "home",
        grid: gridLabel,
        label: `${homeLabel}: ${gridLabel}`,
      },
      homeMarker.bounds,
    );
  }

  if (picked) {
    const gridLabel = formatMaidenheadDisplay(picked.grid);
    pushGridFeatures(
      features,
      {
        kind: "pick",
        grid: gridLabel,
        label: `${pickedLabel}: ${gridLabel}`,
      },
      picked.bounds,
    );
  }

  if (showQsoMarkers) {
    for (const item of qsoMarkers) {
      const gridLabel = formatMaidenheadDisplay(item.grid);
      pushGridFeatures(
        features,
        {
          kind: "qso",
          grid: gridLabel,
          label: gridLabel,
        },
        item.bounds,
      );
    }
  }

  return { type: "FeatureCollection", features };
}

function syncGridSquareLayers(
  map: MapLibreMap,
  collection: GridFeatureCollection,
  theme: HamMapTheme | null,
  emphasized = false,
) {
  const homeFill = emphasized
    ? theme === "dark"
      ? "rgba(16, 185, 129, 0.3)"
      : "rgba(5, 150, 105, 0.3)"
    : theme === "dark"
      ? "rgba(16, 185, 129, 0.28)"
      : "rgba(5, 150, 105, 0.22)";
  const homeLine = emphasized
    ? theme === "dark"
      ? "rgba(110, 231, 183, 1)"
      : "rgba(4, 120, 87, 1)"
    : theme === "dark"
      ? "rgba(110, 231, 183, 0.95)"
      : "rgba(4, 120, 87, 0.9)";
  const pickFill =
    theme === "dark" ? "rgba(251, 191, 36, 0.28)" : "rgba(217, 119, 6, 0.2)";
  const pickLine =
    theme === "dark" ? "rgba(252, 211, 77, 0.95)" : "rgba(180, 83, 9, 0.9)";
  const qsoFill = emphasized
    ? theme === "dark"
      ? "rgba(56, 189, 248, 0.3)"
      : "rgba(2, 132, 199, 0.3)"
    : theme === "dark"
      ? "rgba(56, 189, 248, 0.14)"
      : "rgba(2, 132, 199, 0.12)";
  const qsoLine = emphasized
    ? theme === "dark"
      ? "rgba(125, 211, 252, 1)"
      : "rgba(3, 105, 161, 1)"
    : theme === "dark"
      ? "rgba(125, 211, 252, 0.75)"
      : "rgba(3, 105, 161, 0.7)";
  const homeText =
    theme === "dark" ? "#a7f3d0" : "#065f46";
  const pickText =
    theme === "dark" ? "#fde68a" : "#92400e";
  const qsoText =
    theme === "dark" ? "#bae6fd" : "#0c4a6e";
  const labelHalo =
    theme === "dark" ? "rgba(0, 0, 0, 0.75)" : "rgba(255, 255, 255, 0.9)";
  const labelAnchor = emphasized ? "bottom-left" : "top-left";
  const labelOffset: [number, number] = emphasized ? [0.15, -0.35] : [0.35, 0.35];
  const labelSize = emphasized
    ? 14
    : (["match", ["get", "kind"], "home", 13, "pick", 13, 11] as [
        "match",
        ["get", "kind"],
        "home",
        number,
        "pick",
        number,
        number,
      ]);

  const source = map.getSource(GRID_SOURCE_ID);
  if (source instanceof GeoJSONSource) {
    source.setData(collection);
  } else {
    map.addSource(GRID_SOURCE_ID, {
      type: "geojson",
      data: collection,
    });
  }

  if (!map.getLayer(GRID_FILL_LAYER_ID)) {
    map.addLayer({
      id: GRID_FILL_LAYER_ID,
      type: "fill",
      source: GRID_SOURCE_ID,
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: {
        "fill-color": [
          "match",
          ["get", "kind"],
          "home",
          homeFill,
          "pick",
          pickFill,
          qsoFill,
        ],
        "fill-opacity": 1,
      },
    });
  } else {
    map.setPaintProperty(GRID_FILL_LAYER_ID, "fill-color", [
      "match",
      ["get", "kind"],
      "home",
      homeFill,
      "pick",
      pickFill,
      qsoFill,
    ]);
  }

  if (!map.getLayer(GRID_LINE_LAYER_ID)) {
    map.addLayer({
      id: GRID_LINE_LAYER_ID,
      type: "line",
      source: GRID_SOURCE_ID,
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: {
        "line-color": [
          "match",
          ["get", "kind"],
          "home",
          homeLine,
          "pick",
          pickLine,
          qsoLine,
        ],
        "line-width": [
          "match",
          ["get", "kind"],
          "home",
          emphasized ? 3 : 2.5,
          "pick",
          2.5,
          emphasized ? 3 : 1.5,
        ],
        "line-opacity": 1,
      },
    });
  } else {
    map.setPaintProperty(GRID_LINE_LAYER_ID, "line-color", [
      "match",
      ["get", "kind"],
      "home",
      homeLine,
      "pick",
      pickLine,
      qsoLine,
    ]);
    map.setPaintProperty(GRID_LINE_LAYER_ID, "line-width", [
      "match",
      ["get", "kind"],
      "home",
      emphasized ? 3 : 2.5,
      "pick",
      2.5,
      emphasized ? 3 : 1.5,
    ]);
  }

  if (!map.getLayer(GRID_LABEL_LAYER_ID)) {
    map.addLayer({
      id: GRID_LABEL_LAYER_ID,
      type: "symbol",
      source: GRID_SOURCE_ID,
      filter: ["==", ["geometry-type"], "Point"],
      layout: {
        "text-field": ["get", "grid"],
        "text-font": ["Metropolis Semi Bold", "Noto Sans Regular"],
        "text-size": labelSize,
        "text-anchor": labelAnchor,
        "text-offset": labelOffset,
        "text-allow-overlap": true,
        "text-ignore-placement": true,
      },
      paint: {
        "text-color": [
          "match",
          ["get", "kind"],
          "home",
          homeText,
          "pick",
          pickText,
          qsoText,
        ],
        "text-halo-color": labelHalo,
        "text-halo-width": 1.5,
        "text-opacity": 1,
      },
    });
  } else {
    map.setPaintProperty(GRID_LABEL_LAYER_ID, "text-color", [
      "match",
      ["get", "kind"],
      "home",
      homeText,
      "pick",
      pickText,
      qsoText,
    ]);
    map.setPaintProperty(GRID_LABEL_LAYER_ID, "text-halo-color", labelHalo);
    map.setLayoutProperty(GRID_LABEL_LAYER_ID, "text-size", labelSize);
    map.setLayoutProperty(GRID_LABEL_LAYER_ID, "text-anchor", labelAnchor);
    map.setLayoutProperty(GRID_LABEL_LAYER_ID, "text-offset", labelOffset);
  }
}

function setGridRectangleVisibility(map: MapLibreMap, visible: boolean) {
  const value = visible ? "visible" : "none";
  for (const layerId of [
    GRID_FILL_LAYER_ID,
    GRID_LINE_LAYER_ID,
    GRID_LABEL_LAYER_ID,
  ]) {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, "visibility", value);
    }
  }
}

function formatTraceDistanceKm(km: number): string {
  if (!Number.isFinite(km) || km < 0) return "0";
  if (km < 100) {
    const rounded = Math.round(km * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  }
  return String(Math.round(km));
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function hamMapPopupClassName(theme: HamMapTheme | null): string {
  return theme === "dark"
    ? "ham-map-popup ham-map-popup--dark"
    : "ham-map-popup ham-map-popup--light";
}

function buildQsoMarkerPopupHtml(
  marker: QsoGridMarker,
  labels: {
    qsoCount: string;
    more: string | null;
  },
  options?: {
    highlightId?: string | null;
    theme?: HamMapTheme | null;
  },
): string {
  const highlightId = options?.highlightId ?? null;
  const dark = options?.theme === "dark";
  const muted = dark ? "rgba(255,255,255,0.62)" : "rgba(24,24,27,0.62)";
  const soft = dark ? "rgba(255,255,255,0.78)" : "rgba(24,24,27,0.78)";
  const highlightBg = dark
    ? "rgba(56,189,248,0.16)"
    : "rgba(2,132,199,0.1)";
  const highlightBorder = dark
    ? "rgba(125,211,252,0.45)"
    : "rgba(3,105,161,0.35)";

  const ordered = highlightId
    ? [
        ...marker.qsos.filter((qso) => qso.id === highlightId),
        ...marker.qsos.filter((qso) => qso.id !== highlightId),
      ]
    : marker.qsos;

  const maxRows = 8;
  const rows = ordered.slice(0, maxRows);
  const list = rows
    .map((qso) => {
      const meta = [qso.band, qso.mode].filter(Boolean).join(" · ");
      const highlighted = highlightId === qso.id;
      return `<div style="margin-top:8px;padding:6px 8px;border-radius:8px;${
        highlighted
          ? `background:${highlightBg};border:1px solid ${highlightBorder};`
          : ""
      }">
        <div style="font-weight:600">${escapeHtml(qso.workedCallsign)}${
          meta
            ? ` <span style="font-weight:400;color:${soft}">· ${escapeHtml(meta)}</span>`
            : ""
        }</div>
        <div style="font-size:11px;color:${muted};margin-top:2px">${escapeHtml(formatQsoDateTime(qso.qsoAt))}</div>
      </div>`;
    })
    .join("");
  const more = labels.more
    ? `<div style="margin-top:8px;font-size:11px;color:${muted}">${escapeHtml(labels.more)}</div>`
    : "";

  return `<div style="min-width:11rem;max-width:16rem">
    <div style="font-weight:700">${escapeHtml(formatMaidenheadDisplay(marker.grid))}</div>
    <div style="font-size:12px;color:${muted};margin-top:2px">${escapeHtml(labels.qsoCount)}</div>
    ${list}${more}
  </div>`;
}

function bindMarkerPopupToggle(
  marker: Marker,
  onActivate?: () => void,
) {
  const el = marker.getElement();
  el.style.cursor = "pointer";
  // MapLibre 6 opens marker popups from map `click` when the target is the
  // marker. Stopping propagation (to avoid grid-pick) means we must toggle
  // the popup ourselves on the element click.
  el.addEventListener("click", (event) => {
    event.stopPropagation();
    onActivate?.();
    marker.togglePopup();
  });
  el.addEventListener("dblclick", (event) => {
    event.stopPropagation();
  });
}

function createQsoMarkerPopup(
  marker: QsoGridMarker,
  theme: HamMapTheme | null,
  labels: { qsoCount: string; more: string | null },
  highlightId?: string | null,
): Popup {
  return new Popup({
    offset: 12,
    maxWidth: "280px",
    className: hamMapPopupClassName(theme),
    closeButton: true,
    // Avoid the same map click that opens the popup also closing it.
    closeOnClick: false,
  }).setHTML(
    buildQsoMarkerPopupHtml(marker, labels, {
      highlightId,
      theme,
    }),
  );
}

function fitMapToBounds(
  map: MapLibreMap,
  bounds: LngLatBounds,
  qsoListOpen: boolean,
) {
  const container = map.getContainer();
  const width = container.clientWidth || 0;
  const height = container.clientHeight || 0;
  if (width < 80 || height < 80) return;

  const listPad = qsoListOpen ? HAM_MAP_QSO_LIST_WIDTH_PX : 0;
  const maxPadX = Math.max(24, Math.floor(width / 2) - 32);
  const maxPadY = Math.max(24, Math.floor(height / 2) - 32);
  const padding = {
    top: Math.min(96, maxPadY),
    bottom: Math.min(96, maxPadY),
    left: Math.min(96 + listPad, maxPadX),
    right: Math.min(96, maxPadX),
  };

  try {
    map.stop();
    map.fitBounds(bounds, {
      padding,
      maxZoom: 9,
      duration: 800,
      essential: true,
    });
  } catch {
    const camera = map.cameraForBounds(bounds, { padding: 48 });
    if (camera) {
      map.easeTo({ ...camera, duration: 800, essential: true });
    }
  }
}

function labelTraceDistances(
  collection: QsoTraceFeatureCollection,
  formatLabel: (km: number) => string,
): QsoTraceFeatureCollection {
  return {
    type: "FeatureCollection",
    features: collection.features.map((feature) => ({
      ...feature,
      properties: {
        ...feature.properties,
        distanceLabel: formatLabel(feature.properties.distanceKm),
      },
    })),
  };
}

function syncTraceLayers(
  map: MapLibreMap,
  collection: QsoTraceFeatureCollection,
  theme: HamMapTheme | null,
  visible: boolean,
  emphasized = false,
) {
  const lineColor = emphasized
    ? theme === "dark"
      ? "rgba(125, 211, 252, 1)"
      : "rgba(2, 132, 199, 1)"
    : theme === "dark"
      ? "rgba(125, 211, 252, 0.75)"
      : "rgba(2, 132, 199, 0.65)";
  const lineOpacity = emphasized ? 1 : 0.9;
  const lineWidth = emphasized ? 2.5 : 1.75;
  const labelColor =
    theme === "dark" ? "#e0f2fe" : "#0c4a6e";
  const labelHalo =
    theme === "dark" ? "rgba(0, 0, 0, 0.8)" : "rgba(255, 255, 255, 0.95)";
  const labelsVisible = visible && emphasized;

  const source = map.getSource(TRACE_SOURCE_ID);
  if (source instanceof GeoJSONSource) {
    source.setData(collection);
  } else {
    map.addSource(TRACE_SOURCE_ID, {
      type: "geojson",
      data: collection,
    });
  }

  if (!map.getLayer(TRACE_LAYER_ID)) {
    map.addLayer({
      id: TRACE_LAYER_ID,
      type: "line",
      source: TRACE_SOURCE_ID,
      layout: {
        "line-cap": "round",
        "line-join": "round",
        visibility: visible ? "visible" : "none",
      },
      paint: {
        "line-color": lineColor,
        "line-width": lineWidth,
        "line-opacity": lineOpacity,
      },
    });
  } else {
    map.setPaintProperty(TRACE_LAYER_ID, "line-color", lineColor);
    map.setPaintProperty(TRACE_LAYER_ID, "line-width", lineWidth);
    map.setPaintProperty(TRACE_LAYER_ID, "line-opacity", lineOpacity);
    map.setLayoutProperty(
      TRACE_LAYER_ID,
      "visibility",
      visible ? "visible" : "none",
    );
  }

  if (!map.getLayer(TRACE_LABEL_LAYER_ID)) {
    map.addLayer({
      id: TRACE_LABEL_LAYER_ID,
      type: "symbol",
      source: TRACE_SOURCE_ID,
      layout: {
        "symbol-placement": "line-center",
        "text-field": ["get", "distanceLabel"],
        "text-font": ["Metropolis Semi Bold", "Noto Sans Regular"],
        "text-size": 18,
        "text-rotation-alignment": "viewport",
        "text-pitch-alignment": "viewport",
        "text-allow-overlap": true,
        "text-ignore-placement": true,
        visibility: labelsVisible ? "visible" : "none",
      },
      paint: {
        "text-color": labelColor,
        "text-halo-color": labelHalo,
        "text-halo-width": 2,
      },
    });
  } else {
    map.setPaintProperty(TRACE_LABEL_LAYER_ID, "text-color", labelColor);
    map.setPaintProperty(TRACE_LABEL_LAYER_ID, "text-halo-color", labelHalo);
    map.setLayoutProperty(TRACE_LABEL_LAYER_ID, "text-size", 18);
    map.setLayoutProperty(
      TRACE_LABEL_LAYER_ID,
      "text-rotation-alignment",
      "viewport",
    );
    map.setLayoutProperty(
      TRACE_LABEL_LAYER_ID,
      "visibility",
      labelsVisible ? "visible" : "none",
    );
  }
}

type Props = {
  mapTilerKey: string;
  callsign: string;
  operatorName: string;
  operatorImage?: string | null;
  verified: boolean;
  homeGrid: string;
  homeMarker: HomeGridMarker | null;
  qsos: QsoListItemDto[];
  showQsoMarkers: boolean;
  branding: { siteName: string; logoUrl?: string };
  canSetHomeLocation?: boolean;
  /** Owner has no callsign yet — shown in place of the empty QSO list. */
  needsCallsign?: boolean;
};

let mapLibreWorkerConfigured = false;

function ensureMapLibreWorker() {
  if (mapLibreWorkerConfigured) return;
  setWorkerUrl(MAPLIBRE_WORKER_URL);
  mapLibreWorkerConfigured = true;
}

export function HamMapFullscreenView({
  mapTilerKey,
  callsign,
  operatorName,
  operatorImage,
  verified,
  homeGrid,
  homeMarker,
  qsos,
  showQsoMarkers,
  branding,
  canSetHomeLocation = false,
  needsCallsign = false,
}: Props) {
  const t = useTranslations("ham.map");
  const shellRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const qsoMarkersByGridRef = useRef(new Map<string, Marker>());
  const appliedThemeRef = useRef<HamMapTheme | null>(null);
  const hasFittedCameraRef = useRef(false);
  const [mapTheme, setMapTheme] = useState<HamMapTheme | null>(null);
  const themeReady = mapTheme !== null;
  const [overrideHomeMarker, setOverrideHomeMarker] =
    useState<HomeGridMarker | null>(null);
  const [pickedGrid, setPickedGrid] = useState<PickedGrid | null>(null);
  const [showGridRectangles, setShowGridRectangles] = useState(true);
  const [showLocationMarkers, setShowLocationMarkers] = useState(true);
  const [showTraces, setShowTraces] = useState(true);
  const [qsoTimeRange, setQsoTimeRange] = useState<HamMapQsoTimeRange>("24h");
  const [qsoListOpen, setQsoListOpen] = useState(false);
  const [selectedQsoId, setSelectedQsoId] = useState<string | null>(null);
  const [isBrowserFullscreen, setIsBrowserFullscreen] = useState(false);
  const [fullscreenSupported, setFullscreenSupported] = useState(false);
  const activeHomeMarker = homeMarker ?? overrideHomeMarker;
  const activeHomeGrid = activeHomeMarker?.grid ?? homeGrid;
  const filteredQsos = useMemo(
    () => (showQsoMarkers ? filterQsosByTimeRange(qsos, qsoTimeRange) : []),
    [showQsoMarkers, qsos, qsoTimeRange],
  );
  const qsoMarkers: QsoGridMarker[] = useMemo(
    () =>
      showQsoMarkers ? aggregateQsoGridMarkers(filteredQsos) : [],
    [showQsoMarkers, filteredQsos],
  );
  const activeSelectedQsoId =
    qsoListOpen &&
    selectedQsoId &&
    filteredQsos.some((item) => item.id === selectedQsoId)
      ? selectedQsoId
      : null;
  const focusGrid = useMemo(() => {
    if (!activeSelectedQsoId) return null;
    const qso = filteredQsos.find((item) => item.id === activeSelectedQsoId);
    if (!qso?.grid) return null;
    return truncateMaidenhead(qso.grid, 4);
  }, [activeSelectedQsoId, filteredQsos]);
  const mapHomeMarker = useMemo(() => {
    if (!focusGrid) return activeHomeMarker;
    if (!activeHomeMarker) return null;
    const field = truncateMaidenhead(activeHomeMarker.grid, 4);
    const bounds = field ? maidenheadBounds(field) : null;
    if (!field || !bounds) return null;
    return { ...activeHomeMarker, grid: field, bounds };
  }, [focusGrid, activeHomeMarker]);
  const mapPickedGrid = focusGrid ? null : pickedGrid;
  const mapQsoMarkers = useMemo(() => {
    if (!focusGrid) return qsoMarkers;

    const fieldQsos = filteredQsos.filter(
      (item) =>
        Boolean(item.grid) && truncateMaidenhead(item.grid, 4) === focusGrid,
    );
    const aggregated = aggregateQsoGridMarkers(fieldQsos);
    if (aggregated.length === 0) return [];

    const bounds = maidenheadBounds(focusGrid);
    const center = maidenheadToLatLng(focusGrid);
    if (!bounds || !center) return [];

    const qsos = aggregated
      .flatMap((marker) => marker.qsos)
      .sort((a, b) => b.qsoAt.localeCompare(a.qsoAt));
    const workedCallsigns = [
      ...new Set(qsos.map((item) => item.workedCallsign)),
    ].sort();

    return [
      {
        grid: focusGrid,
        lat: center.lat,
        lng: center.lng,
        bounds,
        qsoCount: qsos.length,
        workedCallsigns,
        qsos,
      },
    ];
  }, [focusGrid, filteredQsos, qsoMarkers]);

  const activeHomeRef = useRef(activeHomeMarker);
  const pickedGridRef = useRef(pickedGrid);
  const showGridRectanglesRef = useRef(showGridRectangles);
  const showLocationMarkersRef = useRef(showLocationMarkers);
  const showTracesRef = useRef(showTraces);
  const lastFittedQsoIdRef = useRef<string | null>(null);
  const activeSelectedQsoIdRef = useRef<string | null>(null);
  const qsoListOpenRef = useRef(qsoListOpen);

  useEffect(() => {
    activeSelectedQsoIdRef.current = activeSelectedQsoId;
  }, [activeSelectedQsoId]);

  useEffect(() => {
    qsoListOpenRef.current = qsoListOpen;
  }, [qsoListOpen]);

  useEffect(() => {
    activeHomeRef.current = activeHomeMarker;
  }, [activeHomeMarker]);

  useEffect(() => {
    pickedGridRef.current = pickedGrid;
  }, [pickedGrid]);

  useEffect(() => {
    showGridRectanglesRef.current = showGridRectangles;
  }, [showGridRectangles]);

  useEffect(() => {
    showLocationMarkersRef.current = showLocationMarkers;
  }, [showLocationMarkers]);

  useEffect(() => {
    showTracesRef.current = showTraces;
  }, [showTraces]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setFullscreenSupported(
        typeof document.documentElement.requestFullscreen === "function",
      );
    });

    function onFullscreenChange() {
      const shell = shellRef.current;
      setIsBrowserFullscreen(Boolean(shell && document.fullscreenElement === shell));
      requestAnimationFrame(() => mapRef.current?.resize());
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
    if (!mapTilerKey || !mapTheme || !containerRef.current || mapRef.current) return;

    ensureMapLibreWorker();

    const map = new MapLibreMap({
      container: containerRef.current,
      style: mapTilerStyleUrl(mapTheme, mapTilerKey),
      center: [0, 20],
      zoom: 1.5,
      attributionControl: {},
    });

    map.addControl(new NavigationControl(), "bottom-right");
    mapRef.current = map;
    appliedThemeRef.current = mapTheme;

    const onLoad = () => {
      map.resize();
    };
    map.on("load", onLoad);
    // Ensure layout after the fixed fullscreen container paints.
    requestAnimationFrame(() => map.resize());

    return () => {
      map.off("load", onLoad);
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
      appliedThemeRef.current = null;
      hasFittedCameraRef.current = false;
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
    if (!map || !mapTilerKey) return;

    const applyMarkers = (fitCamera: boolean) => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      qsoMarkersByGridRef.current.clear();

      const bounds = new LngLatBounds();
      let hasBounds = false;

      const focusMode = Boolean(focusGrid);
      syncGridSquareLayers(
        map,
        buildGridFeatureCollection(
          mapHomeMarker,
          mapQsoMarkers,
          showQsoMarkers,
          t("homeMarkerLabel"),
          pickedGridRef.current,
          t("pickedGridLabel"),
        ),
        mapTheme,
        focusMode,
      );
      setGridRectangleVisibility(map, showGridRectanglesRef.current);

      const tracesVisible =
        showTracesRef.current &&
        showQsoMarkers &&
        Boolean(activeHomeMarker) &&
        mapQsoMarkers.length > 0;
      syncTraceLayers(
        map,
        labelTraceDistances(
          buildQsoTraceFeatureCollection(
            // Traces always originate from the station home, even when home grid is hidden.
            activeHomeMarker,
            showQsoMarkers ? mapQsoMarkers : [],
          ),
          (km) => t("traceDistanceKm", { km: formatTraceDistanceKm(km) }),
        ),
        mapTheme,
        tracesVisible,
        focusMode,
      );

      if (showLocationMarkersRef.current && mapHomeMarker) {
        const el = document.createElement("div");
        el.className =
          "flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-emerald-500 shadow-lg";
        const marker = new Marker({ element: el })
          .setLngLat([mapHomeMarker.lng, mapHomeMarker.lat])
          .setPopup(
            new Popup({
              offset: 12,
              className: hamMapPopupClassName(mapTheme),
              closeButton: true,
              closeOnClick: false,
            }).setHTML(
              `<strong>${escapeHtml(mapHomeMarker.callsign)}</strong><br/>${escapeHtml(t("homeMarkerLabel"))}: ${escapeHtml(formatMaidenheadDisplay(mapHomeMarker.grid))}<br/>${escapeHtml(t("homeLocationLabel"))}: ${mapHomeMarker.lat.toFixed(5)}, ${mapHomeMarker.lng.toFixed(5)}<br/><span style="font-size:12px">${escapeHtml(mapHomeMarker.fromLocation ? t("homeLocationFromGps") : t("homeLocationFromGrid"))}</span>`,
            ),
          )
          .addTo(map);
        bindMarkerPopupToggle(marker, () => {
          if (pickedGridRef.current) setPickedGrid(null);
        });
        markersRef.current.push(marker);
      }

      // Camera bounds: when focused, use the displayed (4-char) rectangles.
      if (focusMode) {
        if (mapHomeMarker) {
          bounds.extend([mapHomeMarker.bounds.west, mapHomeMarker.bounds.south]);
          bounds.extend([mapHomeMarker.bounds.east, mapHomeMarker.bounds.north]);
          hasBounds = true;
        }
      } else if (activeHomeMarker) {
        bounds.extend([activeHomeMarker.bounds.west, activeHomeMarker.bounds.south]);
        bounds.extend([activeHomeMarker.bounds.east, activeHomeMarker.bounds.north]);
        bounds.extend([activeHomeMarker.lng, activeHomeMarker.lat]);
        hasBounds = true;
      }

      if (showQsoMarkers) {
        const showQsoPins = showLocationMarkersRef.current || focusMode;
        let focusedQsoMarker: Marker | null = null;
        for (const item of mapQsoMarkers) {
          if (showQsoPins) {
            const el = document.createElement("div");
            el.className =
              mapTheme === "dark"
                ? "h-3.5 w-3.5 rounded-full border border-white/80 bg-sky-400 shadow"
                : "h-3.5 w-3.5 rounded-full border border-white bg-sky-600 shadow";
            const extra = Math.max(0, item.qsos.length - 8);
            const selectedId = activeSelectedQsoIdRef.current;
            const popup = createQsoMarkerPopup(
              item,
              mapTheme,
              {
                qsoCount: t("qsoCount", { count: item.qsoCount }),
                more:
                  extra > 0
                    ? t("qsoMarkerMore", { count: extra })
                    : null,
              },
              focusMode ? selectedId : null,
            );
            const marker = new Marker({ element: el })
              .setLngLat([item.lng, item.lat])
              .setPopup(popup)
              .addTo(map);
            bindMarkerPopupToggle(marker, () => {
              if (pickedGridRef.current) setPickedGrid(null);
            });
            markersRef.current.push(marker);
            qsoMarkersByGridRef.current.set(normalizeGrid(item.grid), marker);
            focusedQsoMarker = marker;
          }
          bounds.extend([item.bounds.west, item.bounds.south]);
          bounds.extend([item.bounds.east, item.bounds.north]);
          hasBounds = true;
        }

        const selectedId = activeSelectedQsoIdRef.current;
        const willFitFocus =
          focusMode &&
          hasBounds &&
          Boolean(selectedId) &&
          lastFittedQsoIdRef.current !== selectedId;

        if (focusMode && focusedQsoMarker) {
          const markerToOpen = focusedQsoMarker;
          const openPopup = () => {
            const popup = markerToOpen.getPopup();
            if (popup && !popup.isOpen()) {
              markerToOpen.togglePopup();
            }
          };
          if (willFitFocus) {
            map.once("moveend", openPopup);
            // Fallback if fitBounds does not emit moveend.
            window.setTimeout(openPopup, 900);
          } else {
            window.setTimeout(openPopup, 0);
          }
        }
      }

      const selectedId = activeSelectedQsoIdRef.current;
      if (focusMode && hasBounds && selectedId) {
        if (lastFittedQsoIdRef.current !== selectedId) {
          fitMapToBounds(map, bounds, qsoListOpenRef.current);
          lastFittedQsoIdRef.current = selectedId;
        }
      } else if (fitCamera && hasBounds) {
        map.fitBounds(bounds, { padding: 80, maxZoom: 12, duration: 0 });
        hasFittedCameraRef.current = true;
      }

      if (!focusMode) {
        lastFittedQsoIdRef.current = null;
      }
    };

    const onStyleLoad = () => {
      // Basemap style reload resets layers — re-fit once for the new style.
      hasFittedCameraRef.current = false;
      applyMarkers(true);
    };

    if (map.isStyleLoaded()) {
      // Keep zoom when only QSO time-filter / marker data changes.
      applyMarkers(!hasFittedCameraRef.current);
    }
    map.on("style.load", onStyleLoad);
    return () => {
      map.off("style.load", onStyleLoad);
    };
  }, [activeHomeMarker, focusGrid, mapHomeMarker, mapQsoMarkers, showQsoMarkers, showLocationMarkers, mapTheme, mapTilerKey, t]);

  // Keep pick rectangle on the grid layer without re-fitting the camera.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapTilerKey || !map.isStyleLoaded()) return;

    syncGridSquareLayers(
      map,
      buildGridFeatureCollection(
        mapHomeMarker,
        mapQsoMarkers,
        showQsoMarkers,
        t("homeMarkerLabel"),
        mapPickedGrid,
        t("pickedGridLabel"),
      ),
      mapTheme,
      Boolean(focusGrid),
    );
    setGridRectangleVisibility(map, showGridRectangles);
  }, [
    focusGrid,
    mapPickedGrid,
    showGridRectangles,
    mapHomeMarker,
    mapQsoMarkers,
    showQsoMarkers,
    mapTheme,
    mapTilerKey,
    t,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapTilerKey || !map.isStyleLoaded()) return;
    setGridRectangleVisibility(map, showGridRectangles);
  }, [showGridRectangles, mapTilerKey, mapTheme]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapTilerKey || !map.isStyleLoaded()) return;

    const tracesVisible =
      showTraces &&
      showQsoMarkers &&
      Boolean(activeHomeMarker) &&
      mapQsoMarkers.length > 0;
    syncTraceLayers(
      map,
      labelTraceDistances(
        buildQsoTraceFeatureCollection(
          activeHomeMarker,
          showQsoMarkers ? mapQsoMarkers : [],
        ),
        (km) => t("traceDistanceKm", { km: formatTraceDistanceKm(km) }),
      ),
      mapTheme,
      tracesVisible,
      Boolean(focusGrid),
    );
  }, [
    focusGrid,
    showTraces,
    activeHomeMarker,
    mapQsoMarkers,
    showQsoMarkers,
    mapTheme,
    mapTilerKey,
    t,
  ]);

  // When a QSO is selected, fit both home + QSO field squares into view.
  // applyMarkers also fits on selection; this covers cases where overlays are
  // already in sync and only the selection id changed.
  useEffect(() => {
    if (!activeSelectedQsoId || !focusGrid) {
      lastFittedQsoIdRef.current = null;
      return;
    }
    if (lastFittedQsoIdRef.current === activeSelectedQsoId) return;

    const map = mapRef.current;
    if (!map || !mapTilerKey || !map.isStyleLoaded()) return;

    const bounds = new LngLatBounds();
    let hasBounds = false;

    if (mapHomeMarker) {
      bounds.extend([mapHomeMarker.bounds.west, mapHomeMarker.bounds.south]);
      bounds.extend([mapHomeMarker.bounds.east, mapHomeMarker.bounds.north]);
      hasBounds = true;
    } else if (activeHomeMarker) {
      bounds.extend([
        activeHomeMarker.bounds.west,
        activeHomeMarker.bounds.south,
      ]);
      bounds.extend([
        activeHomeMarker.bounds.east,
        activeHomeMarker.bounds.north,
      ]);
      hasBounds = true;
    }

    for (const item of mapQsoMarkers) {
      bounds.extend([item.bounds.west, item.bounds.south]);
      bounds.extend([item.bounds.east, item.bounds.north]);
      hasBounds = true;
    }

    if (!hasBounds) return;

    fitMapToBounds(map, bounds, qsoListOpen);
    lastFittedQsoIdRef.current = activeSelectedQsoId;
  }, [
    activeSelectedQsoId,
    focusGrid,
    mapHomeMarker,
    mapQsoMarkers,
    activeHomeMarker,
    qsoListOpen,
    mapTilerKey,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapTilerKey || !themeReady) return;

    const onMapClick = (event: {
      lngLat: { lat: number; lng: number };
      originalEvent?: Event;
    }) => {
      const target = event.originalEvent?.target;
      if (
        target instanceof Element &&
        target.closest(".maplibregl-marker, .maplibregl-popup, .ham-map-popup")
      ) {
        return;
      }

      const { lat, lng } = event.lngLat;
      const home = activeHomeRef.current;

      if (home && pointInMaidenheadBounds(lat, lng, home.bounds)) {
        setPickedGrid(null);
        return;
      }

      const precision =
        home && home.grid.length >= 4 && home.grid.length % 2 === 0
          ? home.grid.length
          : 6;
      const grid = latLngToMaidenhead(lat, lng, precision);
      if (!grid) return;

      if (home && normalizeGrid(home.grid) === normalizeGrid(grid)) {
        setPickedGrid(null);
        return;
      }

      const bounds = maidenheadBounds(grid);
      if (!bounds) return;

      // Close any open QSO popups when picking an empty grid square.
      for (const marker of qsoMarkersByGridRef.current.values()) {
        const popup = marker.getPopup();
        if (popup?.isOpen()) marker.togglePopup();
      }

      setPickedGrid({ grid, bounds, lat, lng });
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

  function focusHomeGrid() {
    const map = mapRef.current;
    const marker = activeHomeMarker;
    if (!map || !marker) return;

    const bounds = new LngLatBounds();
    bounds.extend([marker.bounds.west, marker.bounds.south]);
    bounds.extend([marker.bounds.east, marker.bounds.north]);
    bounds.extend([marker.lng, marker.lat]);
    map.fitBounds(bounds, { padding: 80, maxZoom: 12, duration: 800 });
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

  const hasMarkers =
    Boolean(activeHomeMarker) || (showQsoMarkers && qsoMarkers.length > 0);
  const panelTheme = mapTheme ?? "light";
  const emptyBanner =
    panelTheme === "light"
      ? "border-zinc-300/80 bg-white/90 text-zinc-900 shadow-lg shadow-zinc-900/10"
      : "border-white/10 bg-black/70 text-white/90";
  const emptyMuted = panelTheme === "light" ? "text-zinc-500" : "text-white/70";

  return (
    <div ref={shellRef} className="fixed inset-0 z-[100] bg-zinc-200">
      {mapTilerKey ? (
        // MapLibre sets position:relative on this node — use h-full/w-full, not absolute inset-0
        // (inset collapses to height 0 → black map, no tiles). See .cursor/rules/maplibre-container.mdc
        <div
          ref={containerRef}
          id="ham-map-tour-pins"
          className="h-full w-full"
          aria-label={t("title")}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-zinc-950 p-6 pl-[min(100%,23rem)]">
          <div className="max-w-md rounded-xl border border-white/10 bg-black/60 px-6 py-5 text-center text-white shadow-lg backdrop-blur-md">
            <p className="text-lg font-medium">{t("mapUnavailable")}</p>
            <p className="mt-2 text-sm text-white/70">{t("mapUnavailableHint")}</p>
          </div>
        </div>
      )}

      <HamMapFloatingPanel
        callsign={callsign}
        operatorName={operatorName}
        operatorImage={operatorImage}
        verified={verified}
        homeGrid={activeHomeGrid}
        branding={branding}
        mapTheme={panelTheme}
        themeReady={themeReady}
        onMapThemeChange={onMapThemeChange}
        showLogbookPrivateNotice={!showQsoMarkers && Boolean(activeHomeMarker)}
        mapAvailable={Boolean(mapTilerKey)}
        onFocusHomeGrid={activeHomeMarker ? focusHomeGrid : undefined}
        offsetLeft={
          showQsoMarkers && qsoListOpen ? HAM_MAP_QSO_LIST_WIDTH_PX : 0
        }
      />

      <div className="pointer-events-none absolute right-3 top-3 z-20 flex flex-col items-end gap-2">
        <HamMapTour
          mapTheme={panelTheme}
          enabled={Boolean(mapTilerKey) && themeReady}
          autoStart={Boolean(mapTilerKey) && themeReady}
        >
          {({ startTour }) => (
            <>
              <div
                id="ham-map-tour-layers"
                className="flex items-center gap-2"
              >
                <HamMapTourHelpButton
                  mapTheme={panelTheme}
                  onClick={startTour}
                />
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
                  showTraces={showTraces}
                  onToggleTraces={() => setShowTraces((current) => !current)}
                  tracesAvailable={
                    showQsoMarkers &&
                    Boolean(activeHomeMarker) &&
                    qsoMarkers.length > 0
                  }
                  isBrowserFullscreen={isBrowserFullscreen}
                  onToggleBrowserFullscreen={() => {
                    void toggleBrowserFullscreen();
                  }}
                  fullscreenSupported={fullscreenSupported}
                />
              </div>
              {showQsoMarkers ? (
                <div id="ham-map-tour-time-filter">
                  <HamMapQsoTimeFilter
                    mapTheme={panelTheme}
                    value={qsoTimeRange}
                    onChange={setQsoTimeRange}
                  />
                </div>
              ) : null}
            </>
          )}
        </HamMapTour>
      </div>

      {showQsoMarkers ? (
        <HamMapQsoListPanel
          mapTheme={panelTheme}
          open={qsoListOpen}
          onOpenChange={(open) => {
            setQsoListOpen(open);
            if (!open) setSelectedQsoId(null);
          }}
          qsos={filteredQsos}
          totalQsos={qsos.length}
          needsCallsign={needsCallsign}
          selectedQsoId={activeSelectedQsoId}
          onSelectQso={setSelectedQsoId}
        />
      ) : null}

      <HamMapHomeLocationPrompt
        enabled={canSetHomeLocation && !activeHomeMarker}
        callsign={callsign}
        mapTheme={panelTheme}
        onLocationSaved={(marker) => {
          setOverrideHomeMarker(marker);
        }}
      />

      {mapTilerKey && !hasMarkers ? (
        <div
          className={`pointer-events-none absolute bottom-6 left-1/2 z-20 w-[min(92vw,28rem)] -translate-x-1/2 rounded-xl border px-4 py-3 text-center text-sm backdrop-blur-md ${emptyBanner}`}
        >
          <p className="font-medium">{t("emptyTitle")}</p>
          <p className={`mt-1 text-xs ${emptyMuted}`}>{t("emptyMessage")}</p>
        </div>
      ) : null}
    </div>
  );
}
