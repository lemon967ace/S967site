import { parseDocument } from "../editor/editor-document.js";
import { FixedBuilding, FixedBuildingType, FixedRange, MapDocument, createUniqueId, isValidMapCell } from "../editor/editor-model.js";
import { OccupancyManager } from "../editor/editor-occupancy.js";
import { parseTemplate, serializeTemplate } from "../editor/editor-template.js";

export function emptyTemplate() {
  return serializeTemplate({ fixedBuildingTypes: [], fixedBuildings: [], fixedRanges: [], view: { centerX: 0, centerY: 0, zoom: 1 } });
}

function rawDocument(parsed) {
  return new MapDocument({ title: "Template", fixedBuildingTypes: parsed.fixedBuildingTypes, fixedBuildings: parsed.fixedBuildings, fixedRanges: parsed.fixedRanges, view: parsed.view });
}

export class TemplateEditorEngine {
  #document;
  constructor(input = emptyTemplate()) { this.loadTemplate(input); }
  getDocument() { return this.#document; }
  getView() { return { ...this.#document.view }; }
  snapshot() { return serializeTemplate(this.#document); }
  restore(snapshot) { this.loadTemplate(snapshot); }
  loadTemplate(input) { const parsed = parseTemplate(input); this.#document = rawDocument(parsed); return this.#document; }
  exportTemplate() { return serializeTemplate(this.#document); }
  setView({ centerX, centerY, zoom }) {
    if (!isValidMapCell(centerX, centerY) || typeof zoom !== "number" || !Number.isFinite(zoom) || zoom < .01 || zoom > 4) throw new RangeError("Invalid template view.");
    this.#document.view = { centerX, centerY, zoom }; return { persisted: true };
  }
  #change(mutator) {
    const raw = this.snapshot(); mutator(raw); const parsed = parseTemplate(raw); this.#document = rawDocument(parsed); return this.#document;
  }
  addType(data) {
    const id = data.id || createUniqueId();
    this.#change(raw => raw.fixed_building_types.push({ id, name: data.name, color: data.color, width: data.width, height: data.height }));
    return this.#document.fixedBuildingTypes.find(item => item.id === id);
  }
  editType(id, changes) {
    this.#change(raw => { const item = required(raw.fixed_building_types, id, "type"); Object.assign(item, pick(changes, ["name", "color", "width", "height"])); });
    return this.#document.fixedBuildingTypes.find(item => item.id === id);
  }
  deleteType(id) {
    if (this.#document.fixedBuildings.some(item => item.typeId === id)) throw new RangeError("A type used by a fixed building cannot be deleted.");
    this.#change(raw => raw.fixed_building_types.splice(indexOf(raw.fixed_building_types, id, "type"), 1));
  }
  checkPlacement(typeId, x, y, ignoreBuildingId = null) {
    const type = this.#document.fixedBuildingTypes.find(item => item.id === typeId); if (!type) throw new RangeError(`Unknown fixed building type ID: ${typeId}`);
    return new OccupancyManager(this.#document.fixedBuildings).checkPosition({ x, y, width: type.width, height: type.height, ignoreBuildingId });
  }
  addBuilding({ id = createUniqueId(), name, typeId, type_id, x, y }) {
    const targetType = typeId ?? type_id; if (!this.checkPlacement(targetType, x, y).canPlace) throw new RangeError("Fixed building cannot be placed.");
    this.#change(raw => raw.fixed_buildings.push({ id, name, type_id: targetType, x, y })); return this.#document.fixedBuildings.find(item => item.id === id);
  }
  editBuilding(id, changes) {
    const old = this.#document.fixedBuildings.find(item => item.id === id); if (!old) throw new RangeError(`Unknown fixed building ID: ${id}`);
    const typeId = changes.typeId ?? changes.type_id ?? old.typeId, x = changes.x ?? old.x, y = changes.y ?? old.y;
    if (!this.checkPlacement(typeId, x, y, id).canPlace) throw new RangeError("Fixed building cannot be placed.");
    this.#change(raw => { const item = required(raw.fixed_buildings, id, "building"); Object.assign(item, pick({ ...changes, type_id: typeId, x, y }, ["name", "type_id", "x", "y"])); });
    return this.#document.fixedBuildings.find(item => item.id === id);
  }
  moveBuilding(id, x, y) { return this.editBuilding(id, { x, y }); }
  deleteBuilding(id) { let value; this.#change(raw => { const index = indexOf(raw.fixed_buildings, id, "building"); value = raw.fixed_buildings.splice(index, 1)[0]; }); return value; }
  addRange({ id = createUniqueId(), kind, color, cells }) { this.#change(raw => raw.fixed_ranges.push({ id, kind, color, cells })); return this.#document.fixedRanges.find(item => item.id === id); }
  editRange(id, changes) { this.#change(raw => Object.assign(required(raw.fixed_ranges, id, "range"), pick(changes, ["kind", "color", "cells"]))); return this.#document.fixedRanges.find(item => item.id === id); }
  deleteRange(id) { this.#change(raw => raw.fixed_ranges.splice(indexOf(raw.fixed_ranges, id, "range"), 1)); }
  eraseRangeCells(cells) {
    const keys = new Set(cells.map(cell => cell.join(","))); let removed = 0;
    this.#change(raw => { raw.fixed_ranges = raw.fixed_ranges.flatMap(range => { const remaining = range.cells.filter(cell => !keys.has(cell.join(","))); removed += range.cells.length - remaining.length; return remaining.length ? [{ ...range, cells: remaining }] : []; }); });
    return removed;
  }
}

export function convertDocumentToTemplate(input) {
  const source = parseDocument(input), usedTypeIds = new Set(source.fixedBuildingTypes.map(item => item.id));
  const usedBuildingIds = new Set(source.fixedBuildings.map(item => item.id)), usedRangeIds = new Set(source.fixedRanges.map(item => item.id));
  const typeSource = new Map(source.buildingTypes.map(item => [item.id, item])), combos = new Map();
  for (const building of source.buildings) combos.set(`${building.typeId}|${building.width}|${building.height}`, { typeId: building.typeId, width: building.width, height: building.height });
  const comboCounts = new Map(); for (const combo of combos.values()) comboCounts.set(combo.typeId, (comboCounts.get(combo.typeId) || 0) + 1);
  const comboIds = new Map(), newTypes = [];
  for (const [key, combo] of combos) {
    const original = typeSource.get(combo.typeId), id = unique(`${combo.typeId}-${combo.width}x${combo.height}`, usedTypeIds); comboIds.set(key, id);
    newTypes.push(new FixedBuildingType({ id, name: comboCounts.get(combo.typeId) > 1 ? `${original.name} (${combo.width}x${combo.height})` : original.name, color: original.color, width: combo.width, height: combo.height }));
  }
  const convertedBuildings = source.buildings.map(item => new FixedBuilding({ id: unique(item.id, usedBuildingIds), name: item.name, type_id: comboIds.get(`${item.typeId}|${item.width}|${item.height}`), x: item.x, y: item.y, width: item.width, height: item.height }));
  const convertedRanges = source.ranges.map(item => new FixedRange({ id: unique(item.id, usedRangeIds), kind: item.kind, color: item.color, cells: item.cells }));
  const document = new MapDocument({ title: "Template", fixedBuildingTypes: [...source.fixedBuildingTypes, ...newTypes], fixedBuildings: [...source.fixedBuildings, ...convertedBuildings], fixedRanges: [...source.fixedRanges, ...convertedRanges], view: source.view });
  new OccupancyManager(document.fixedBuildings);
  return serializeTemplate(document);
}

function unique(base, ids) { let value = base, number = 2; while (ids.has(value)) value = `${base}-${number++}`; ids.add(value); return value; }
function indexOf(items, id, label) { const index = items.findIndex(item => item.id === id); if (index < 0) throw new RangeError(`Unknown fixed ${label} ID: ${id}`); return index; }
function required(items, id, label) { return items[indexOf(items, id, label)]; }
function pick(source, keys) { return Object.fromEntries(keys.filter(key => source[key] !== undefined).map(key => [key, source[key]])); }
