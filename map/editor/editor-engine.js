import { Building, BuildingType, MapDocument } from "./editor-model.js";
import { OccupancyManager } from "./editor-occupancy.js";
import { parseDocument, serializeDocument } from "./editor-document.js";
import { nearestValidGridCoordinate } from "./editor-coordinates.js";

const COLORS = ["#4E79A7", "#F28E2B", "#E15759", "#76B7B2", "#59A14F", "#EDC948", "#B07AA1"];
let document = null, occupancy = null, readOnly = false;

export function createNewDocument({ title = "Untitled Map", readOnly: locked = false } = {}) {
  // Python create_building_types() stores these Korean names in the document.
  // UI localization is a separate display concern and must not rewrite saved data.
  document = new MapDocument({ title, buildingTypes: COLORS.map((color, i) => new BuildingType({ id: `type-${String(i + 1).padStart(2, "0")}`, name: `건물 종류 ${i + 1}`, color })), view: { centerX: 0, centerY: 0, zoom: 1 } });
  occupancy = new OccupancyManager(); readOnly = Boolean(locked); return getDocument();
}
export function loadDocument(data, options = {}) { document = parseDocument(data); occupancy = new OccupancyManager(document.buildings); readOnly = Boolean(options.readOnly); return getDocument(); }
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
export function canPlaceBuilding({ x, y, width, height, ignoreBuildingId = null }) { requireDocument(); return occupancy.checkPosition({ x, y, width, height, ignoreBuildingId }); }
export function addBuilding(data) { ensureWritable(); const building = data instanceof Building ? data : new Building(data); if (!document.buildingTypes.some(type => type.id === building.typeId)) throw new RangeError(`Unknown building type ID: ${building.typeId}`); occupancy.addBuilding(building); document.buildings.push(building); return new Building(building); }
export function moveBuilding(buildingId, newX, newY) { ensureWritable(); const moved = occupancy.moveBuilding(buildingId, newX, newY); return new Building(moved); }
export function deleteBuilding(buildingId) { ensureWritable(); const building = occupancy.requireBuilding(buildingId); if (building.locked) throw new RangeError("Locked buildings cannot be deleted."); const removed = occupancy.removeBuilding(buildingId); document.buildings = document.buildings.filter(item => item.id !== buildingId); return new Building(removed); }
export function editBuilding(buildingId, changes = {}) {
  ensureWritable();
  const current = occupancy.requireBuilding(buildingId);
  if (current.locked && Object.keys(changes).some(key => key !== "locked")) throw new RangeError("Locked buildings cannot be edited.");
  const candidate = new Building({
    id: current.id, name: changes.name ?? current.name, typeId: changes.typeId ?? changes.type_id ?? current.typeId,
    x: current.x, y: current.y, width: changes.width ?? current.width, height: changes.height ?? current.height,
    affiliation: changes.affiliation ?? current.affiliation, locked: changes.locked ?? current.locked,
  });
  if (!document.buildingTypes.some(type => type.id === candidate.typeId)) throw new RangeError(`Unknown building type ID: ${candidate.typeId}`);
  const check = occupancy.checkPosition({ x: candidate.x, y: candidate.y, width: candidate.width, height: candidate.height, ignoreBuildingId: current.id });
  if (!check.canPlace) throw new RangeError("Building cannot be resized at its current position.");
  occupancy.removeBuilding(current.id);
  try { occupancy.addBuilding(candidate); } catch (error) { occupancy.addBuilding(current); throw error; }
  const index = document.buildings.findIndex(item => item.id === buildingId);
  document.buildings[index] = candidate;
  return new Building(candidate);
}
function requireDocument() { if (!document) throw new Error("No map document is loaded."); }
function ensureWritable() { requireDocument(); if (readOnly) throw new Error("The map is read-only."); }

export const PNSMapEngine = { createNewDocument, loadDocument, exportDocument, getDocument, getOccupancy, isReadOnly, getView, setView, canPlaceBuilding, addBuilding, moveBuilding, deleteBuilding, editBuilding };
if (typeof window !== "undefined") window.PNSMapEngine = PNSMapEngine;
export default PNSMapEngine;
