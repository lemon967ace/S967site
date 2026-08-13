import { MAP_MIN_X, MAP_MAX_X, MAP_MIN_Y, MAP_MAX_Y, isValidMapCell } from "./editor-model.js";

export const DEFAULT_TILE_WIDTH = 64;
export const DEFAULT_TILE_HEIGHT = 32;
const FLOAT_TOLERANCE = 1e-9;

function options(value = {}) { return { tileWidth: 64, tileHeight: 32, originX: 0, originY: 0, ...value }; }
function validateTileSize({ tileWidth, tileHeight }) { if (tileWidth <= 0 || tileHeight <= 0) throw new RangeError("Tile dimensions must be positive."); }

export function gridToScene(gridX, gridY, rawOptions) {
  const o = options(rawOptions); validateTileSize(o);
  if (!isValidMapCell(gridX, gridY)) throw new RangeError("Invalid map cell.");
  return [o.originX + gridX * (o.tileWidth / 2), o.originY + gridY * (o.tileHeight / 2)];
}

export function sceneToGridContinuous(sceneX, sceneY, rawOptions) {
  const o = options(rawOptions); validateTileSize(o);
  return [(sceneX - o.originX) / (o.tileWidth / 2), (sceneY - o.originY) / (o.tileHeight / 2)];
}

export function diamondVertices(gridX, gridY, rawOptions) {
  const o = options(rawOptions), [x, y] = gridToScene(gridX, gridY, o);
  return [[x, y - o.tileHeight / 2], [x + o.tileWidth / 2, y], [x, y + o.tileHeight / 2], [x - o.tileWidth / 2, y]];
}

export function pointIsInsideDiamond(pointX, pointY, gridX, gridY, rawOptions) {
  const o = options(rawOptions), [x, y] = gridToScene(gridX, gridY, o);
  return Math.abs(pointX - x) / (o.tileWidth / 2) + Math.abs(pointY - y) / (o.tileHeight / 2) <= 1 + FLOAT_TOLERANCE;
}

export function sceneToGrid(sceneX, sceneY, rawOptions) {
  const o = options(rawOptions); validateTileSize(o);
  const [estimatedX, estimatedY] = sceneToGridContinuous(sceneX, sceneY, o);
  const candidates = [];
  for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) {
    const cell = [Math.floor(estimatedX) + dx, Math.floor(estimatedY) + dy]; if (isValidMapCell(...cell)) candidates.push(cell);
  }
  candidates.sort((a, b) => (Math.abs(a[0] - estimatedX) + Math.abs(a[1] - estimatedY)) - (Math.abs(b[0] - estimatedX) + Math.abs(b[1] - estimatedY)) || a[1] - b[1] || a[0] - b[0]);
  return candidates.find(cell => pointIsInsideDiamond(sceneX, sceneY, ...cell, o)) ?? null;
}

export function nearestValidGridCoordinate(gridX, gridY) {
  const candidates = [];
  const roundedX = Math.round(gridX), roundedY = Math.round(gridY);
  for (let dx = -3; dx <= 3; dx++) for (let dy = -3; dy <= 3; dy++) if (isValidMapCell(roundedX + dx, roundedY + dy)) candidates.push([roundedX + dx, roundedY + dy]);
  if (!candidates.length) {
    const x = Math.min(MAP_MAX_X, Math.max(MAP_MIN_X, roundedX)), y = Math.min(MAP_MAX_Y, Math.max(MAP_MIN_Y, roundedY));
    for (let cx = Math.max(MAP_MIN_X, x - 2); cx <= Math.min(MAP_MAX_X, x + 2); cx++) for (let cy = Math.max(MAP_MIN_Y, y - 2); cy <= Math.min(MAP_MAX_Y, y + 2); cy++) if (isValidMapCell(cx, cy)) candidates.push([cx, cy]);
  }
  candidates.sort((a, b) => ((a[0]-gridX)**2 + (a[1]-gridY)**2) - ((b[0]-gridX)**2 + (b[1]-gridY)**2) || a[1]-b[1] || a[0]-b[0]);
  return candidates[0];
}

export function visibleGridBoundaryRanges(rect, rawOptions) {
  const o = options(rawOptions); validateTileSize(o);
  const corners = [
    sceneToGridContinuous(rect.left, rect.top, o),
    sceneToGridContinuous(rect.right, rect.top, o),
    sceneToGridContinuous(rect.left, rect.bottom, o),
    sceneToGridContinuous(rect.right, rect.bottom, o),
  ];
  const differences = corners.map(([x, y]) => y - x);
  const sums = corners.map(([x, y]) => y + x);
  return {
    xBoundaries: oddLineIndexRange(Math.min(...differences), Math.max(...differences), -511, 1023),
    yBoundaries: oddLineIndexRange(Math.min(...sums), Math.max(...sums), -1, 1535),
  };
}

export function gridLineSceneEndpoints(axis, boundaryValue, rawOptions) {
  const o = options(rawOptions); validateTileSize(o);
  let fullMinimum, fullMaximum, points;
  if (axis === "x") { fullMinimum = -511; fullMaximum = 1023; }
  else if (axis === "y") { fullMinimum = -1; fullMaximum = 1535; }
  else throw new RangeError("Grid line axis must be x or y.");
  const maximumIndex = (fullMaximum - fullMinimum) / 2;
  if (!Number.isInteger(boundaryValue) || boundaryValue < 0 || boundaryValue > maximumIndex) throw new RangeError("Grid boundary is outside the map.");
  const value = fullMinimum + boundaryValue * 2;
  points = clipNormalizedLine(axis === "x" ? "difference" : "sum", value);
  return points.map(([x, y]) => [o.originX + x * (o.tileWidth / 2), o.originY + y * (o.tileHeight / 2)]);
}

function oddLineIndexRange(minimum, maximum, fullMinimum, fullMaximum) {
  let first = Math.max(fullMinimum, Math.floor(minimum) - 2);
  let last = Math.min(fullMaximum, Math.ceil(maximum) + 2);
  if (first % 2 === 0) first += 1;
  if (last % 2 === 0) last -= 1;
  if (first > last) return [];
  const result = [];
  for (let index = (first - fullMinimum) / 2; index <= (last - fullMinimum) / 2; index++) result.push(index);
  return result;
}

function clipNormalizedLine(kind, value) {
  const minX = MAP_MIN_X - 1, maxX = MAP_MAX_X + 1;
  const minY = MAP_MIN_Y - 1, maxY = MAP_MAX_Y + 1;
  const candidates = [];
  if (kind === "difference") {
    for (const x of [minX, maxX]) { const y = x + value; if (y >= minY && y <= maxY) candidates.push([x, y]); }
    for (const y of [minY, maxY]) { const x = y - value; if (x >= minX && x <= maxX) candidates.push([x, y]); }
  } else {
    for (const x of [minX, maxX]) { const y = value - x; if (y >= minY && y <= maxY) candidates.push([x, y]); }
    for (const y of [minY, maxY]) { const x = value - y; if (x >= minX && x <= maxX) candidates.push([x, y]); }
  }
  const unique = candidates.filter((point, index) => candidates.findIndex(other => other[0] === point[0] && other[1] === point[1]) === index);
  if (unique.length < 2) throw new RangeError("Grid line does not intersect the map.");
  return unique.slice(0, 2);
}
