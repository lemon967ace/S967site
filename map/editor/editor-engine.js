import { Building, BuildingType, MAP_MAX_X, MAP_MAX_Y, MAP_MIN_X, MAP_MIN_Y, MapDocument, MapRange } from "./editor-model.js";
import { OccupancyManager } from "./editor-occupancy.js";
import { parseDocument, serializeDocument } from "./editor-document.js";
import { nearestValidGridCoordinate } from "./editor-coordinates.js";
import { applyRangeOverlapRules } from "./editor-range.js";
import { evaluatePlacementCells } from "./editor-placement-rules.js";
import { applyTemplateToNewDocument } from "./editor-template.js";

const COLORS = ["#4E79A7", "#F28E2B", "#E15759", "#76B7B2", "#59A14F", "#EDC948", "#B07AA1"];
let document = null, occupancy = null, readOnly = false;

export function initialMapView({ minX = MAP_MIN_X, maxX = MAP_MAX_X, minY = MAP_MIN_Y, maxY = MAP_MAX_Y } = {}) {
  const [centerX, centerY] = nearestValidGridCoordinate((minX + maxX) / 2, (minY + maxY) / 2);
  return { centerX, centerY, zoom: 1 };
}

export function createNewDocument({ title = "Untitled Map", readOnly: locked = false, template = null } = {}) {
  // Python create_building_types() stores these Korean names in the document.
  // UI localization is a separate display concern and must not rewrite saved data.
  document = template ? applyTemplateToNewDocument(template, { title }) : new MapDocument({ title, buildingTypes: COLORS.map((color, i) => new BuildingType({ id: `type-${String(i + 1).padStart(2, "0")}`, name: `건물 종류 ${i + 1}`, color })), view: { centerX: 0, centerY: 0, zoom: 1 } });
  document.view = initialMapView();
  occupancy = new OccupancyManager([...document.fixedBuildings, ...document.buildings]); readOnly = Boolean(locked); return getDocument();
}
export function loadDocument(data, options = {}) { document = parseDocument(data); occupancy = new OccupancyManager([...document.fixedBuildings, ...document.buildings]); readOnly = Boolean(options.readOnly); return getDocument(); }
export function exportDocument() { requireDocument(); return serializeDocument(document); }
export function getDocument() { requireDocument(); return parseDocument(serializeDocument(document)); }
export function getOccupancy() { requireDocument(); return occupancy; }
export function isReadOnly() { return readOnly; }
export function getView() { requireDocument(); return { ...document.view }; }
export function setView({ centerX, centerY, zoom }) {
  requireDocument();
  const [validX, validY] = nearestValidGridCoordinate(centerX, centerY);
  const next = { centerX: validX, centerY: validY, zoom: Math.max(0.01, Math.min(4, zoom)) };
  if (!readOnly) document.view = next;
  return { ...next, persisted: !readOnly };
}
export function canPlaceBuilding({ x, y, width, height, ignoreBuildingId = null }) { requireDocument(); const result = occupancy.checkPosition({ x, y, width, height, ignoreBuildingId }); const rules = evaluatePlacementCells(result.occupiedCells, document); return { ...result, rangeBlockedCells: rules.blockedCells, canPlace: result.canPlace && rules.allowed }; }
export function addBuilding(data) { ensureWritable(); const building = data instanceof Building ? data : new Building(data); if (!document.buildingTypes.some(type => type.id === building.typeId)) throw new RangeError(`Unknown building type ID: ${building.typeId}`); if (!canPlaceBuilding(building).canPlace) throw new RangeError("Building cannot be placed."); occupancy.addBuilding(building); document.buildings.push(building); return new Building(building); }
export function moveBuilding(buildingId, newX, newY) { ensureWritable(); requireUserBuilding(buildingId); const current = occupancy.requireBuilding(buildingId); const rules = canPlaceBuilding({ x: newX, y: newY, width: current.width, height: current.height, ignoreBuildingId: buildingId }); if (!rules.canPlace) throw new RangeError("Building cannot be moved."); const moved = occupancy.moveBuilding(buildingId, newX, newY); return new Building(moved); }
export function deleteBuilding(buildingId) { ensureWritable(); const building = requireUserBuilding(buildingId); if (building.locked) throw new RangeError("Locked buildings cannot be deleted."); const removed = occupancy.removeBuilding(buildingId); document.buildings = document.buildings.filter(item => item.id !== buildingId); return new Building(removed); }
export function deleteBuildings(buildingIds) {
  ensureWritable();
  const ids = new Set(buildingIds);
  const targets = document.buildings.filter(item => ids.has(item.id));
  if (targets.some(item => item.locked)) throw new RangeError("Locked buildings cannot be deleted.");
  if (targets.length !== ids.size) throw new RangeError("Unknown building ID.");
  document.buildings = document.buildings.filter(item => !ids.has(item.id));
  occupancy = new OccupancyManager([...document.fixedBuildings, ...document.buildings]);
  return targets.map(item => new Building(item));
}
export function restoreBuildings(states) {
  ensureWritable();
  const additions = states.map(item => item instanceof Building ? new Building(item) : new Building(item));
  const next = [...document.buildings, ...additions];
  const nextOccupancy = new OccupancyManager([...document.fixedBuildings, ...next]);
  document.buildings = next; occupancy = nextOccupancy;
  return additions.map(item => new Building(item));
}
export function editBuilding(buildingId, changes = {}) {
  ensureWritable();
  const current = requireUserBuilding(buildingId);
  if (current.locked && Object.keys(changes).some(key => key !== "locked")) throw new RangeError("Locked buildings cannot be edited.");
  const candidate = new Building({
    id: current.id, name: changes.name ?? current.name, typeId: changes.typeId ?? changes.type_id ?? current.typeId,
    x: current.x, y: current.y, width: changes.width ?? current.width, height: changes.height ?? current.height,
    affiliation: changes.affiliation ?? current.affiliation, locked: changes.locked ?? current.locked,
  });
  if (!document.buildingTypes.some(type => type.id === candidate.typeId)) throw new RangeError(`Unknown building type ID: ${candidate.typeId}`);
  const check = canPlaceBuilding({ x: candidate.x, y: candidate.y, width: candidate.width, height: candidate.height, ignoreBuildingId: current.id });
  if (!check.canPlace) throw new RangeError("Building cannot be resized at its current position.");
  occupancy.removeBuilding(current.id);
  try { occupancy.addBuilding(candidate); } catch (error) { occupancy.addBuilding(current); throw error; }
  const index = document.buildings.findIndex(item => item.id === buildingId);
  document.buildings[index] = candidate;
  return new Building(candidate);
}
export function restoreBuildingState(data) {
  ensureWritable(); const candidate = data instanceof Building ? new Building(data) : new Building(data);
  if (!document.buildingTypes.some(type => type.id === candidate.typeId)) throw new RangeError(`Unknown building type ID: ${candidate.typeId}`);
  const current = requireUserBuilding(candidate.id);
  const check = canPlaceBuilding({ x: candidate.x, y: candidate.y, width: candidate.width, height: candidate.height, ignoreBuildingId: current.id });
  if (!check.canPlace) throw new RangeError("Building state cannot be restored.");
  occupancy.removeBuilding(current.id); try { occupancy.addBuilding(candidate); } catch (error) { occupancy.addBuilding(current); throw error; }
  document.buildings[document.buildings.findIndex(item => item.id === candidate.id)] = candidate; return new Building(candidate);
}
export function commitRange(data) {
  ensureWritable(); const candidate = data instanceof MapRange ? data : new MapRange(data);
  const result = applyRangeOverlapRules(document.ranges, { kind: candidate.kind, color: candidate.color, locked: candidate.locked, cells: candidate.cells }, document.fixedRanges);
  document.ranges = result.ranges.map(item => new MapRange(item)); return { accepted: result.accepted.map(cell => [...cell]), range: document.ranges.at(-1) ? new MapRange(document.ranges.at(-1)) : null };
}
export function editRange(rangeId, { locked }) { ensureWritable(); const index = document.ranges.findIndex(item => item.id === rangeId); if (index < 0) throw new RangeError(`Unknown range ID: ${rangeId}`); const current = document.ranges[index]; const edited = new MapRange({ id: current.id, kind: current.kind, color: current.color, locked: Boolean(locked), cells: current.cells }); document.ranges[index] = edited; return new MapRange(edited); }
export function deleteRange(rangeId) { ensureWritable(); const index = document.ranges.findIndex(item => item.id === rangeId); if (index < 0) throw new RangeError(`Unknown range ID: ${rangeId}`); const current = document.ranges[index]; if (current.locked) throw new RangeError("Locked ranges cannot be deleted."); document.ranges.splice(index, 1); return new MapRange(current); }
export function restoreRanges(ranges) { ensureWritable(); const restored = ranges.map(item => new MapRange(item)); new MapDocument({ ...document, ranges: restored }); document.ranges = restored; return getDocument().ranges; }
function requireDocument() { if (!document) throw new Error("No map document is loaded."); }
function requireUserBuilding(id) { const item = document.buildings.find(building => building.id === id); if (!item) { if (document.fixedBuildings.some(building => building.id === id)) throw new RangeError("Fixed buildings cannot be modified."); throw new RangeError(`Unknown building ID: ${id}`); } return item; }
function ensureWritable() { requireDocument(); if (readOnly) throw new Error("The map is read-only."); }

export const PNSMapEngine = { createNewDocument, initialMapView, loadDocument, exportDocument, getDocument, getOccupancy, isReadOnly, getView, setView, canPlaceBuilding, addBuilding, moveBuilding, deleteBuilding, deleteBuildings, restoreBuildings, editBuilding, restoreBuildingState, commitRange, editRange, deleteRange, restoreRanges };
if (typeof window !== "undefined") window.PNSMapEngine = PNSMapEngine;
export default PNSMapEngine;
