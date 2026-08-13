import { isValidMapCell } from "./editor-model.js";

export function calculateOccupiedCells(x, y, width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new RangeError("Building width and height must be positive integers.");
  }
  const cells = [];
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      const dx = column - row;
      const dy = -(column + row);
      cells.push([x + dx, y + dy]);
    }
  }
  return cells;
}

export class OccupancyManager {
  constructor(buildings = []) { this.rebuild(buildings); }
  rebuild(buildings) {
    const occupied = new Map(), byId = new Map();
    for (const building of buildings) {
      if (byId.has(building.id)) throw new RangeError(`Duplicate building ID: ${building.id}`);
      for (const cell of building.occupiedCells()) { const key = cell.join(","); if (occupied.has(key)) throw new RangeError(`Buildings overlap at ${key}`); occupied.set(key, building.id); }
      byId.set(building.id, building);
    }
    this.occupiedByCoordinate = occupied; this.buildingsById = byId;
  }
  buildingIdAt(x, y) { return this.occupiedByCoordinate.get(`${x},${y}`) ?? null; }
  buildingAt(x, y) { return this.buildingsById.get(this.buildingIdAt(x, y)) ?? null; }
  checkPosition({ x, y, width, height, ignoreBuildingId = null }) {
    const occupiedCells = calculateOccupiedCells(x, y, width, height);
    const invalidCells = occupiedCells.filter(cell => !isValidMapCell(...cell)).sort(compareCells);
    const conflictingCells = occupiedCells.filter(cell => { const id = this.buildingIdAt(...cell); return id !== null && id !== ignoreBuildingId; }).filter(uniqueCells).sort(compareCells);
    return { canPlace: !invalidCells.length && !conflictingCells.length, occupiedCells, conflictingCells, invalidCells, blockedCells: [...invalidCells, ...conflictingCells].filter(uniqueCells).sort(compareCells) };
  }
  checkNewBuilding(building) { return this.checkPosition({ x: building.x, y: building.y, width: building.width, height: building.height }); }
  checkMove(buildingId, newX, newY) { const b = this.requireBuilding(buildingId); return this.checkPosition({ x: newX, y: newY, width: b.width, height: b.height, ignoreBuildingId: buildingId }); }
  addBuilding(building) { if (this.buildingsById.has(building.id)) throw new RangeError(`Duplicate building ID: ${building.id}`); const result = this.checkNewBuilding(building); if (!result.canPlace) throw new RangeError("Building cannot be placed."); this.buildingsById.set(building.id, building); for (const cell of building.occupiedCells()) this.occupiedByCoordinate.set(cell.join(","), building.id); }
  removeBuilding(buildingId) { const b = this.requireBuilding(buildingId); for (const cell of b.occupiedCells()) this.occupiedByCoordinate.delete(cell.join(",")); this.buildingsById.delete(buildingId); return b; }
  moveBuilding(buildingId, newX, newY) { const b = this.requireBuilding(buildingId), result = this.checkMove(buildingId, newX, newY); if (b.locked) throw new RangeError("Locked buildings cannot be moved."); if (!result.canPlace) throw new RangeError("Building cannot be moved."); for (const cell of b.occupiedCells()) this.occupiedByCoordinate.delete(cell.join(",")); b.x = newX; b.y = newY; for (const cell of b.occupiedCells()) this.occupiedByCoordinate.set(cell.join(","), b.id); return b; }
  requireBuilding(id) { const b = this.buildingsById.get(id); if (!b) throw new RangeError(`Unknown building ID: ${id}`); return b; }
}
function compareCells(a, b) { return a[0] - b[0] || a[1] - b[1]; }
function uniqueCells(cell, index, array) { return array.findIndex(other => other[0] === cell[0] && other[1] === cell[1]) === index; }
