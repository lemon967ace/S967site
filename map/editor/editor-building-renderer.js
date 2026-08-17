import { diamondVertices } from "./editor-coordinates.js";
import { calculateOccupiedCells } from "./editor-occupancy.js";

export const MINIMUM_FONT_PIXEL_SIZE = 10;
export const MAXIMUM_FONT_PIXEL_SIZE = 48;
const HORIZONTAL_MARGIN_RATIO = 0.84;
const VERTICAL_MARGIN_RATIO = 0.78;
const ELLIPSIS = "…";

export function buildingOccupiedCells(building) {
  return typeof building.occupiedCells === "function"
    ? building.occupiedCells()
    : calculateOccupiedCells(building.x, building.y, building.width, building.height);
}

export function buildingPolygon(building) {
  const points = buildingOccupiedCells(building).flatMap(cell => diamondVertices(...cell));
  return convexHull(points);
}

export function polygonBounds(polygon) {
  const xs = polygon.map(point => point[0]), ys = polygon.map(point => point[1]);
  return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}

export function buildingRenderGeometry(building) {
  const polygon = buildingPolygon(building);
  return { building, polygon, bounds: polygonBounds(polygon) };
}

export function orderBuildingsForDraw(buildings, selectedBuildingId = null) {
  const normal = [], selected = [];
  buildings.forEach((building, documentIndex) => {
    const entry = {
      building,
      documentIndex,
      priority: Number.isInteger(building.priority) ? building.priority : 0,
    };
    (building.id === selectedBuildingId ? selected : normal).push(entry);
  });
  const sort = (a, b) => a.priority - b.priority || a.documentIndex - b.documentIndex;
  normal.sort(sort);
  selected.sort(sort);
  return [...normal, ...selected].map(entry => entry.building);
}

export function cullBuildingGeometries(buildings, visibleSceneRect) {
  return cullBuildingGeometryCache(buildings.map(buildingRenderGeometry), visibleSceneRect);
}

export function cullBuildingGeometryCache(geometries, visibleSceneRect) {
  return geometries.filter(item => rectanglesIntersect(item.bounds, visibleSceneRect));
}

export function hitTestBuildings(sceneX, sceneY, geometries, selectedBuildingId = null) {
  const ordered = orderBuildingsForDraw(geometries.map(item => item.building), selectedBuildingId);
  const byId = new Map(geometries.map(item => [item.building.id, item]));
  for (let index = ordered.length - 1; index >= 0; index--) {
    const geometry = byId.get(ordered[index].id);
    if (geometry && pointInPolygon(sceneX, sceneY, geometry.polygon)) return geometry.building;
  }
  return null;
}

export function preferredFontSizeForZoom(zoom) {
  return Math.max(MINIMUM_FONT_PIXEL_SIZE, Math.min(MAXIMUM_FONT_PIXEL_SIZE, Math.round(10 + 4.5 * zoom)));
}

export function chooseBuildingLabelLayout({ building, bounds, zoom, measureText }) {
  if (zoom < 0.4) return { mode: "hidden" };
  const availableWidth = bounds.width * zoom * HORIZONTAL_MARGIN_RATIO;
  const availableHeight = bounds.height * zoom * VERTICAL_MARGIN_RATIO;
  const preferred = preferredFontSizeForZoom(zoom);
  for (let fontSize = preferred; fontSize >= MINIMUM_FONT_PIXEL_SIZE; fontSize--) {
    const coordinate =
  zoom >= 0.8
    ? `(${building.x}, ${building.y})`
    : "";
    const coordinateSize = measureText(coordinate, fontSize);
    const lineHeight = measureText("가", fontSize).height;
    if (coordinateSize.height + lineHeight <= availableHeight) {
      const name = truncateToFit(building.name, fontSize, availableWidth, lineHeight, measureText);
      const detail = `${name.text}\n${coordinate}`;
      if (name.text && fits(detail, fontSize, availableWidth, availableHeight, measureText)) return { mode: "detail", text: detail, fontPixelSize: fontSize, wasTruncated: name.wasTruncated };
    }
    const name = truncateToFit(building.name, fontSize, availableWidth, availableHeight, measureText);
    if (name.text) return { mode: "name_only", text: name.text, fontPixelSize: fontSize, wasTruncated: name.wasTruncated };
  }
  return { mode: "hidden", text: "", fontPixelSize: MINIMUM_FONT_PIXEL_SIZE, wasTruncated: false };
}

export function labelSceneCenter(geometry) {
  return [(geometry.bounds.left + geometry.bounds.right) / 2, (geometry.bounds.top + geometry.bounds.bottom) / 2];
}

export class BuildingInteractionState {
  constructor() { this.selectedBuildingId = null; this.hoveredBuildingId = null; }
  select(id) { const next = id ?? null, changed = next !== this.selectedBuildingId; this.selectedBuildingId = next; return changed; }
  clearSelection() { return this.select(null); }
  hover(id) { const next = id ?? null, changed = next !== this.hoveredBuildingId; this.hoveredBuildingId = next; return changed; }
  clearHover() { return this.hover(null); }
}

export function isTapSelectionCandidate(candidate, cancelled = false) {
  return Boolean(candidate && candidate.selectionAllowed && !candidate.moved && !cancelled);
}

function truncateToFit(text, fontSize, width, height, measureText) {
  if (fits(text, fontSize, width, height, measureText)) return { text, wasTruncated: false };
  if (!fits(ELLIPSIS, fontSize, width, height, measureText)) return { text: "", wasTruncated: true };
  let low = 0, high = text.length, best = "";
  while (low <= high) {
    const middle = Math.floor((low + high) / 2), candidate = `${text.slice(0, middle).trimEnd()}${ELLIPSIS}`;
    if (fits(candidate, fontSize, width, height, measureText)) { best = candidate; low = middle + 1; } else high = middle - 1;
  }
  return { text: best, wasTruncated: true };
}

function fits(text, fontSize, width, height, measureText) {
  const measured = measureText(text, fontSize);
  return measured.width <= width && measured.height <= height;
}

function rectanglesIntersect(a, b) {
  return a.right >= b.left && a.left <= b.right && a.bottom >= b.top && a.top <= b.bottom;
}

function pointInPolygon(x, y, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i], [xj, yj] = polygon[j];
    if (pointOnSegment(x, y, xj, yj, xi, yi)) return true;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function pointOnSegment(x, y, x1, y1, x2, y2) {
  const cross = (x - x1) * (y2 - y1) - (y - y1) * (x2 - x1);
  if (Math.abs(cross) > 1e-9) return false;
  return x >= Math.min(x1, x2) - 1e-9 && x <= Math.max(x1, x2) + 1e-9 && y >= Math.min(y1, y2) - 1e-9 && y <= Math.max(y1, y2) + 1e-9;
}

function convexHull(points) {
  const unique = [...new Map(points.map(point => [`${point[0]},${point[1]}`, point])).values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (unique.length <= 2) return unique;
  const cross = (origin, a, b) => (a[0] - origin[0]) * (b[1] - origin[1]) - (a[1] - origin[1]) * (b[0] - origin[0]);
  const lower = []; for (const point of unique) { while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), point) <= 0) lower.pop(); lower.push(point); }
  const upper = []; for (const point of [...unique].reverse()) { while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), point) <= 0) upper.pop(); upper.push(point); }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
