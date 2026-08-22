import {
  GeoJSONSource,
  type ExpressionSpecification,
  type Map as MapLibreMap,
  type Marker,
} from "maplibre-gl";
import type { HomeGridMarker } from "@/lib/qso-map";
import type { MaidenheadBounds } from "@/lib/maidenhead";
import type { HamMapTheme } from "@/lib/map/maptiler-style";

const GRID_SOURCE_ID = "qth-grid-squares";
const GRID_FILL_LAYER_ID = "qth-grid-squares-fill";
const GRID_LINE_LAYER_ID = "qth-grid-squares-line";
const GRID_LABEL_LAYER_ID = "qth-grid-squares-label";

export const QTH_GRID_QUERY_LAYER_IDS = [
  GRID_FILL_LAYER_ID,
  GRID_LINE_LAYER_ID,
  GRID_LABEL_LAYER_ID,
] as const;

export type QthGridKind = "station" | "viewer";

export type QthGridStation = {
  marker: HomeGridMarker;
  kind: QthGridKind;
  label: string;
  callsign: string;
};

type GridFeatureCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: {
      kind: QthGridKind;
      grid: string;
      label: string;
      callsign: string;
    };
    geometry:
      | { type: "Polygon"; coordinates: [number, number][][] }
      | { type: "Point"; coordinates: [number, number] };
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

function kindColor(
  station: string,
  viewer: string,
): ExpressionSpecification {
  return ["match", ["get", "kind"], "viewer", viewer, station];
}

function kindWidth(station: number, viewer: number): ExpressionSpecification {
  return ["match", ["get", "kind"], "viewer", viewer, station];
}

function focusOpacity(selectedCallsign: string | null): ExpressionSpecification | number {
  if (!selectedCallsign) return 1;
  return [
    "case",
    ["==", ["get", "callsign"], selectedCallsign],
    1,
    0.15,
  ];
}

export function buildQthGridFeatureCollection(
  entries: QthGridStation[],
): GridFeatureCollection {
  const features: GridFeatureCollection["features"] = [];
  for (const entry of entries) {
    const { marker, kind, label, callsign } = entry;
    const props = { kind, grid: marker.grid, label, callsign };
    features.push({
      type: "Feature",
      properties: props,
      geometry: {
        type: "Polygon",
        coordinates: boundsToCoordinates(marker.bounds),
      },
    });
    features.push({
      type: "Feature",
      properties: props,
      geometry: {
        type: "Point",
        coordinates: [marker.bounds.west, marker.bounds.north],
      },
    });
  }
  return { type: "FeatureCollection", features };
}

export function syncQthGridLayers(
  map: MapLibreMap,
  collection: GridFeatureCollection,
  theme: HamMapTheme,
) {
  const stationFill =
    theme === "dark" ? "rgba(16, 185, 129, 0.28)" : "rgba(5, 150, 105, 0.22)";
  const stationLine =
    theme === "dark" ? "rgba(110, 231, 183, 0.95)" : "rgba(4, 120, 87, 0.9)";
  const stationText = theme === "dark" ? "#a7f3d0" : "#065f46";
  const viewerFill =
    theme === "dark" ? "rgba(167, 139, 250, 0.26)" : "rgba(124, 58, 237, 0.2)";
  const viewerLine =
    theme === "dark" ? "rgba(196, 181, 253, 0.95)" : "rgba(109, 40, 217, 0.9)";
  const viewerText = theme === "dark" ? "#ddd6fe" : "#5b21b6";
  const halo =
    theme === "dark" ? "rgba(0, 0, 0, 0.75)" : "rgba(255, 255, 255, 0.9)";

  const source = map.getSource(GRID_SOURCE_ID);
  if (source instanceof GeoJSONSource) {
    source.setData(collection);
  } else {
    map.addSource(GRID_SOURCE_ID, { type: "geojson", data: collection });
  }

  if (!map.getLayer(GRID_FILL_LAYER_ID)) {
    map.addLayer({
      id: GRID_FILL_LAYER_ID,
      type: "fill",
      source: GRID_SOURCE_ID,
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: {
        "fill-color": kindColor(stationFill, viewerFill),
        "fill-opacity": 1,
      },
    });
  } else {
    map.setPaintProperty(
      GRID_FILL_LAYER_ID,
      "fill-color",
      kindColor(stationFill, viewerFill),
    );
  }

  if (!map.getLayer(GRID_LINE_LAYER_ID)) {
    map.addLayer({
      id: GRID_LINE_LAYER_ID,
      type: "line",
      source: GRID_SOURCE_ID,
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: {
        "line-color": kindColor(stationLine, viewerLine),
        "line-width": kindWidth(2.5, 2.5),
        "line-opacity": 1,
      },
    });
  } else {
    map.setPaintProperty(
      GRID_LINE_LAYER_ID,
      "line-color",
      kindColor(stationLine, viewerLine),
    );
  }

  if (!map.getLayer(GRID_LABEL_LAYER_ID)) {
    map.addLayer({
      id: GRID_LABEL_LAYER_ID,
      type: "symbol",
      source: GRID_SOURCE_ID,
      filter: ["==", ["geometry-type"], "Point"],
      layout: {
        "text-field": ["get", "label"],
        "text-font": ["Metropolis Semi Bold", "Noto Sans Regular"],
        "text-size": 13,
        "text-anchor": "top-left",
        "text-offset": [0.35, 0.35],
        "text-allow-overlap": true,
        "text-ignore-placement": true,
      },
      paint: {
        "text-color": kindColor(stationText, viewerText),
        "text-halo-color": halo,
        "text-halo-width": 1.5,
      },
    });
  } else {
    map.setPaintProperty(
      GRID_LABEL_LAYER_ID,
      "text-color",
      kindColor(stationText, viewerText),
    );
    map.setPaintProperty(GRID_LABEL_LAYER_ID, "text-halo-color", halo);
  }
}

export function setQthGridFocus(
  map: MapLibreMap,
  selectedCallsign: string | null,
) {
  const opacity = focusOpacity(selectedCallsign);
  for (const layerId of [
    GRID_FILL_LAYER_ID,
    GRID_LINE_LAYER_ID,
    GRID_LABEL_LAYER_ID,
  ]) {
    if (!map.getLayer(layerId)) continue;
    const prop =
      layerId === GRID_LABEL_LAYER_ID ? "text-opacity" : layerId === GRID_FILL_LAYER_ID ? "fill-opacity" : "line-opacity";
    map.setPaintProperty(layerId, prop, opacity);
  }
}

export function setQthGridVisibility(map: MapLibreMap, visible: boolean) {
  const visibility = visible ? "visible" : "none";
  for (const layerId of [
    GRID_FILL_LAYER_ID,
    GRID_LINE_LAYER_ID,
    GRID_LABEL_LAYER_ID,
  ]) {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, "visibility", visibility);
    }
  }
}

export function syncQthMarkerFocus(
  markersByCallsign: Map<string, Marker>,
  selectedCallsign: string | null,
) {
  for (const [callsign, marker] of markersByCallsign) {
    marker.getElement().style.opacity =
      !selectedCallsign || callsign === selectedCallsign ? "1" : "0.15";
  }
}

export function buildQthMarkerElement(
  label: string,
  theme: HamMapTheme,
  kind: QthGridKind = "station",
): HTMLDivElement {
  const el = document.createElement("div");
  el.className = `relative flex h-4 w-4 items-center justify-center rounded-full border-2 border-white shadow-lg ${
    kind === "viewer" ? "bg-violet-500" : "bg-emerald-500"
  }`;

  if (!label) return el;

  const caption = document.createElement("span");
  caption.className = `pointer-events-none absolute top-full left-1/2 mt-1 -translate-x-1/2 font-display text-[11px] leading-none font-semibold tracking-wide whitespace-nowrap ${
    theme === "dark" ? "text-white" : "text-zinc-900"
  }`;
  caption.style.textShadow =
    theme === "dark"
      ? "0 0 3px rgba(0,0,0,0.95), 0 0 7px rgba(0,0,0,0.75)"
      : "0 0 3px rgba(255,255,255,0.95), 0 0 7px rgba(255,255,255,0.85)";
  caption.textContent = label;
  el.append(caption);
  return el;
}

export function qthMapPopupClassName(theme: HamMapTheme): string {
  return theme === "dark"
    ? "ham-map-popup ham-map-popup--dark"
    : "ham-map-popup ham-map-popup--light";
}

export function escapeQthHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
