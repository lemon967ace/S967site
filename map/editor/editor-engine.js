import {
  Building,
  BuildingType,
  FixedBuilding,
  FixedBuildingType,
  FixedRange,
  MAP_MAX_X,
  MAP_MAX_Y,
  MAP_MIN_X,
  MAP_MIN_Y,
  MapDocument,
  MapRange,
} from "./editor-model.js";
import { OccupancyManager } from "./editor-occupancy.js";
import { parseDocument, serializeDocument } from "./editor-document.js";
import { nearestValidGridCoordinate } from "./editor-coordinates.js";
import { applyRangeOverlapRules } from "./editor-range.js";
import { evaluatePlacementCells } from "./editor-placement-rules.js";
import {
  applyTemplateToNewDocument,
  parseTemplate,
  serializeTemplate,
} from "./editor-template.js";

const COLORS = [
  "#4E79A7",
  "#F28E2B",
  "#E15759",
  "#76B7B2",
  "#59A14F",
  "#EDC948",
  "#B07AA1",
];

let document = null;
let occupancy = null;
let readOnly = false;
let documentMode = "map";

export function initialMapView({
  minX = MAP_MIN_X,
  maxX = MAP_MAX_X,
  minY = MAP_MIN_Y,
  maxY = MAP_MAX_Y,
} = {}) {
  const [centerX, centerY] = nearestValidGridCoordinate(
    (minX + maxX) / 2,
    (minY + maxY) / 2,
  );
  return { centerX, centerY, zoom: 1 };
}

export function createNewDocument({
  title = "Untitled Map",
  readOnly: locked = false,
  template = null,
} = {}) {
  documentMode = "map";
  document = template
    ? applyTemplateToNewDocument(template, { title })
    : new MapDocument({
        title,
        buildingTypes: COLORS.map((color, i) => new BuildingType({
          id: `type-${String(i + 1).padStart(2, "0")}`,
          name: `건물 종류 ${i + 1}`,
          color,
        })),
        view: { centerX: 0, centerY: 0, zoom: 1 },
      });
  document.view = initialMapView();
  occupancy = new OccupancyManager([...document.fixedBuildings, ...document.buildings]);
  readOnly = Boolean(locked);
  return getDocument();
}

export function createTemplateDocument({ template = null } = {}) {
  documentMode = "template";
  const parsed = template ? parseTemplate(template) : {
    fixedBuildingTypes: [],
    fixedBuildings: [],
    fixedRanges: [],
    view: initialMapView(),
  };
  document = new MapDocument({
    title: "Template",
    fixedBuildingTypes: parsed.fixedBuildingTypes,
    fixedBuildings: parsed.fixedBuildings,
    fixedRanges: parsed.fixedRanges,
    view: parsed.view,
  });
  occupancy = new OccupancyManager(document.fixedBuildings);
  readOnly = false;
  return getDocument();
}

export function loadTemplateDocument(data) {
  return createTemplateDocument({ template: data });
}

export function exportTemplateDocument() {
  requireDocument();
  if (documentMode !== "template") throw new Error("The current document is not a template document.");
  return serializeTemplate(document);
}

export function loadDocument(data, options = {}) {
  documentMode = "map";
  document = parseDocument(data);
  occupancy = new OccupancyManager([...document.fixedBuildings, ...document.buildings]);
  readOnly = Boolean(options.readOnly);
  return getDocument();
}

export function exportDocument() {
  requireDocument();
  if (documentMode !== "map") throw new Error("Template documents must be exported as .isotemplate.");
  return serializeDocument(document);
}

export function getDocument() {
  requireDocument();
  if (documentMode === "template") return cloneDocument(document);
  return parseDocument(serializeDocument(document));
}

export function getDocumentMode() {
  requireDocument();
  return documentMode;
}

export function getOccupancy() {
  requireDocument();
  return occupancy;
}

export function isReadOnly() {
  return readOnly;
}

export function getView() {
  requireDocument();
  return { ...document.view };
}

export function setView({ centerX, centerY, zoom }) {
  requireDocument();
  const [validX, validY] = nearestValidGridCoordinate(centerX, centerY);
  const next = {
    centerX: validX,
    centerY: validY,
    zoom: Math.max(0.01, Math.min(4, zoom)),
  };
  if (!readOnly) document.view = next;
  return { ...next, persisted: !readOnly };
}

// ---------------------------------------------------------------------------
// Regular map editing
// ---------------------------------------------------------------------------

export function canPlaceBuilding({ x, y, width, height, ignoreBuildingId = null }) {
  requireDocument();
  const result = occupancy.checkPosition({ x, y, width, height, ignoreBuildingId });
  const rules = evaluatePlacementCells(result.occupiedCells, document);
  return {
    ...result,
    rangeBlockedCells: rules.blockedCells,
    canPlace: result.canPlace && rules.allowed,
  };
}

export function addBuilding(data) {
  ensureWritable();
  const building = data instanceof Building ? data : new Building(data);
  if (!document.buildingTypes.some(type => type.id === building.typeId)) {
    throw new RangeError(`Unknown building type ID: ${building.typeId}`);
  }
  if (!canPlaceBuilding(building).canPlace) throw new RangeError("Building cannot be placed.");
  occupancy.addBuilding(building);
  document.buildings.push(building);
  return new Building(building);
}

export function moveBuilding(buildingId, newX, newY) {
  ensureWritable();
  requireUserBuilding(buildingId);
  const current = occupancy.requireBuilding(buildingId);
  const rules = canPlaceBuilding({
    x: newX,
    y: newY,
    width: current.width,
    height: current.height,
    ignoreBuildingId: buildingId,
  });
  if (!rules.canPlace) throw new RangeError("Building cannot be moved.");
  const moved = occupancy.moveBuilding(buildingId, newX, newY);
  return new Building(moved);
}

export function deleteBuilding(buildingId) {
  ensureWritable();
  const building = requireUserBuilding(buildingId);
  if (building.locked) throw new RangeError("Locked buildings cannot be deleted.");
  const removed = occupancy.removeBuilding(buildingId);
  document.buildings = document.buildings.filter(item => item.id !== buildingId);
  return new Building(removed);
}

export function deleteBuildings(buildingIds) {
  ensureWritable();
  const ids = new Set(buildingIds);
  const targets = document.buildings.filter(item => ids.has(item.id));
  if (targets.some(item => item.locked)) throw new RangeError("Locked buildings cannot be deleted.");
  if (targets.length !== ids.size) throw new RangeError("Unknown building ID.");
  document.buildings = document.buildings.filter(item => !ids.has(item.id));
  rebuildOccupancy();
  return targets.map(item => new Building(item));
}

export function restoreBuildings(states) {
  ensureWritable();
  const additions = states.map(item => item instanceof Building ? new Building(item) : new Building(item));
  const next = [...document.buildings, ...additions];
  const nextOccupancy = new OccupancyManager([...document.fixedBuildings, ...next]);
  document.buildings = next;
  occupancy = nextOccupancy;
  return additions.map(item => new Building(item));
}

export function editBuilding(buildingId, changes = {}) {
  ensureWritable();
  const current = requireUserBuilding(buildingId);
  if (current.locked && Object.keys(changes).some(key => key !== "locked")) {
    throw new RangeError("Locked buildings cannot be edited.");
  }
  const candidate = new Building({
    id: current.id,
    name: changes.name ?? current.name,
    typeId: changes.typeId ?? changes.type_id ?? current.typeId,
    x: current.x,
    y: current.y,
    width: changes.width ?? current.width,
    height: changes.height ?? current.height,
    affiliation: changes.affiliation ?? current.affiliation,
    locked: changes.locked ?? current.locked,
  });
  if (!document.buildingTypes.some(type => type.id === candidate.typeId)) {
    throw new RangeError(`Unknown building type ID: ${candidate.typeId}`);
  }
  const check = canPlaceBuilding({
    x: candidate.x,
    y: candidate.y,
    width: candidate.width,
    height: candidate.height,
    ignoreBuildingId: current.id,
  });
  if (!check.canPlace) throw new RangeError("Building cannot be resized at its current position.");
  occupancy.removeBuilding(current.id);
  try { occupancy.addBuilding(candidate); }
  catch (error) { occupancy.addBuilding(current); throw error; }
  const index = document.buildings.findIndex(item => item.id === buildingId);
  document.buildings[index] = candidate;
  return new Building(candidate);
}

export function restoreBuildingState(data) {
  ensureWritable();
  const candidate = data instanceof Building ? new Building(data) : new Building(data);
  if (!document.buildingTypes.some(type => type.id === candidate.typeId)) {
    throw new RangeError(`Unknown building type ID: ${candidate.typeId}`);
  }
  const current = requireUserBuilding(candidate.id);
  const check = canPlaceBuilding({
    x: candidate.x,
    y: candidate.y,
    width: candidate.width,
    height: candidate.height,
    ignoreBuildingId: current.id,
  });
  if (!check.canPlace) throw new RangeError("Building state cannot be restored.");
  occupancy.removeBuilding(current.id);
  try { occupancy.addBuilding(candidate); }
  catch (error) { occupancy.addBuilding(current); throw error; }
  document.buildings[document.buildings.findIndex(item => item.id === candidate.id)] = candidate;
  return new Building(candidate);
}

export function commitRange(data) {
  ensureWritable();
  const candidate = data instanceof MapRange ? data : new MapRange(data);
  const result = applyRangeOverlapRules(
    document.ranges,
    {
      kind: candidate.kind,
      color: candidate.color,
      locked: candidate.locked,
      cells: candidate.cells,
    },
    document.fixedRanges,
  );
  document.ranges = result.ranges.map(item => new MapRange(item));
  return {
    accepted: result.accepted.map(cell => [...cell]),
    range: document.ranges.at(-1) ? new MapRange(document.ranges.at(-1)) : null,
  };
}

export function editRange(rangeId, { locked }) {
  ensureWritable();
  const index = document.ranges.findIndex(item => item.id === rangeId);
  if (index < 0) throw new RangeError(`Unknown range ID: ${rangeId}`);
  const current = document.ranges[index];
  const edited = new MapRange({
    id: current.id,
    kind: current.kind,
    color: current.color,
    locked: Boolean(locked),
    cells: current.cells,
  });
  document.ranges[index] = edited;
  return new MapRange(edited);
}

export function deleteRange(rangeId) {
  ensureWritable();
  const index = document.ranges.findIndex(item => item.id === rangeId);
  if (index < 0) throw new RangeError(`Unknown range ID: ${rangeId}`);
  const current = document.ranges[index];
  if (current.locked) throw new RangeError("Locked ranges cannot be deleted.");
  document.ranges.splice(index, 1);
  return new MapRange(current);
}

export function restoreRanges(ranges) {
  ensureWritable();
  const restored = ranges.map(item => new MapRange(item));
  new MapDocument({ ...document, ranges: restored });
  document.ranges = restored;
  return getDocument().ranges;
}

// ---------------------------------------------------------------------------
// Fixed-map template editing. Fixed objects remain locked in stored data;
// administrator editability is provided by these explicit methods instead of
// weakening the model's locked flag.
// ---------------------------------------------------------------------------

export function editBuildingType(typeId, changes = {}) {
  requireDocument();
  ensureWritable();

  const index =
    document.buildingTypes.findIndex(
      item => item.id === typeId
    );

  if (index < 0) {
    throw new RangeError(
      `Unknown building type ID: ${typeId}`
    );
  }

  const current =
    document.buildingTypes[index];

  const edited =
    new BuildingType({
      id: current.id,
      name:
        changes.name ??
        current.name,
      color:
        changes.color ??
        current.color,
    });

  document.buildingTypes[index] =
    edited;

  return {
    ...edited,
  };
}

export function addFixedBuildingType(data) {
  ensureTemplateWritable();
  const type = data instanceof FixedBuildingType ? data : new FixedBuildingType(data);
  if (document.fixedBuildingTypes.some(item => item.id === type.id)) {
    throw new RangeError(`Duplicate fixed building type ID: ${type.id}`);
  }
  document.fixedBuildingTypes.push(type);
  validateTemplateState();
  return new FixedBuildingType(type);
}

export function editFixedBuildingType(typeId, changes = {}) {
  ensureTemplateWritable();
  const index = document.fixedBuildingTypes.findIndex(item => item.id === typeId);
  if (index < 0) throw new RangeError(`Unknown fixed building type ID: ${typeId}`);
  const current = document.fixedBuildingTypes[index];
  const edited = new FixedBuildingType({
    id: current.id,
    name: changes.name ?? current.name,
    color: changes.color ?? current.color,
    width: changes.width ?? current.width,
    height: changes.height ?? current.height,
  });
  const nextTypes = [...document.fixedBuildingTypes];
  nextTypes[index] = edited;
  const nextBuildings = document.fixedBuildings.map(building => {
    if (building.typeId !== typeId) return building;
    return new FixedBuilding({
      id: building.id,
      name: building.name,
      type_id: typeId,
      x: building.x,
      y: building.y,
      width: edited.width,
      height: edited.height,
      color: building.color,
      priority: building.priority,
    });
  });
  const nextOccupancy = new OccupancyManager(nextBuildings);
  document.fixedBuildingTypes = nextTypes;
  document.fixedBuildings = nextBuildings;
  occupancy = new OccupancyManager([...nextBuildings, ...document.buildings]);
  void nextOccupancy;
  validateTemplateState();
  return new FixedBuildingType(edited);
}

export function deleteFixedBuildingType(typeId) {
  ensureTemplateWritable();
  if (document.fixedBuildings.some(item => item.typeId === typeId)) {
    throw new RangeError("A fixed building type in use cannot be deleted.");
  }
  const index = document.fixedBuildingTypes.findIndex(item => item.id === typeId);
  if (index < 0) throw new RangeError(`Unknown fixed building type ID: ${typeId}`);
  return document.fixedBuildingTypes.splice(index, 1)[0];
}

export function canPlaceFixedBuilding({ x, y, width, height, ignoreBuildingId = null }) {
  ensureTemplateWritable();
  return occupancy.checkPosition({ x, y, width, height, ignoreBuildingId });
}

export function addFixedBuilding(data) {
  ensureTemplateWritable();
  const typeId = data.typeId ?? data.type_id;
  const type = requireFixedBuildingType(typeId);
  const candidate = new FixedBuilding({
    ...data,
    type_id: typeId,
    width: type.width,
    height: type.height,
    color: data.color ?? type.color,
    priority: data.priority ?? 0,
  });
  if (!canPlaceFixedBuilding(candidate).canPlace) throw new RangeError("Fixed building cannot be placed.");
  occupancy.addBuilding(candidate);
  document.fixedBuildings.push(candidate);
  return cloneFixedBuilding(candidate);
}

export function moveFixedBuilding(buildingId, newX, newY) {
  ensureTemplateWritable();
  return editFixedBuilding(buildingId, { x: newX, y: newY });
}

export function editFixedBuilding(buildingId, changes = {}) {
  ensureTemplateWritable();
  const index = document.fixedBuildings.findIndex(item => item.id === buildingId);
  if (index < 0) throw new RangeError(`Unknown fixed building ID: ${buildingId}`);
  const current = document.fixedBuildings[index];
  const typeId = changes.typeId ?? changes.type_id ?? current.typeId;
  const type = requireFixedBuildingType(typeId);
  const candidate = new FixedBuilding({
    id: current.id,
    name: changes.name ?? current.name,
    type_id: typeId,
    x: changes.x ?? current.x,
    y: changes.y ?? current.y,
    width: type.width,
    height: type.height,
    color: changes.color ?? current.color ?? type.color,
    priority: changes.priority ?? current.priority ?? 0,
  });
  const check = occupancy.checkPosition({
    x: candidate.x,
    y: candidate.y,
    width: candidate.width,
    height: candidate.height,
    ignoreBuildingId: current.id,
  });
  if (!check.canPlace) throw new RangeError("Fixed building cannot be placed.");
  const next = [...document.fixedBuildings];
  next[index] = candidate;
  occupancy = new OccupancyManager([...next, ...document.buildings]);
  document.fixedBuildings = next;
  validateTemplateState();
  return cloneFixedBuilding(candidate);
}

export function deleteFixedBuilding(buildingId) {
  ensureTemplateWritable();
  const index = document.fixedBuildings.findIndex(item => item.id === buildingId);
  if (index < 0) throw new RangeError(`Unknown fixed building ID: ${buildingId}`);
  const [removed] = document.fixedBuildings.splice(index, 1);
  rebuildOccupancy();
  return cloneFixedBuilding(removed);
}

export function deleteFixedBuildings(buildingIds) {
  ensureTemplateWritable();
  const ids = new Set(buildingIds);
  const targets = document.fixedBuildings.filter(item => ids.has(item.id));
  if (targets.length !== ids.size) throw new RangeError("Unknown fixed building ID.");
  document.fixedBuildings = document.fixedBuildings.filter(item => !ids.has(item.id));
  rebuildOccupancy();
  return targets.map(cloneFixedBuilding);
}

export function restoreFixedBuildings(states) {
  ensureTemplateWritable();
  const additions = states.map(item => {
    const type = requireFixedBuildingType(item.typeId ?? item.type_id);
    return new FixedBuilding({
      ...item,
      type_id: item.typeId ?? item.type_id,
      width: type.width,
      height: type.height,
      color: item.color ?? type.color,
      priority: item.priority ?? 0,
    });
  });
  const next = [...document.fixedBuildings, ...additions];
  occupancy = new OccupancyManager([...next, ...document.buildings]);
  document.fixedBuildings = next;
  validateTemplateState();
  return additions.map(cloneFixedBuilding);
}

export function restoreFixedBuildingState(state) {
  return editFixedBuilding(state.id, state);
}

export function commitFixedRange(data) {
  ensureTemplateWritable();
  const candidate = data instanceof FixedRange ? data : new FixedRange(data);
  const owners = new Set(document.fixedRanges.flatMap(range => range.cells.map(cell => cell.join(","))));
  if (candidate.cells.some(cell => owners.has(cell.join(",")))) {
    throw new RangeError("A fixed range cannot overlap another fixed range.");
  }
  document.fixedRanges.push(candidate);
  validateTemplateState();
  return { accepted: candidate.cells.map(cell => [...cell]), range: cloneFixedRange(candidate) };
}

export function editFixedRange(rangeId, changes = {}) {
  ensureTemplateWritable();
  const index = document.fixedRanges.findIndex(item => item.id === rangeId);
  if (index < 0) throw new RangeError(`Unknown fixed range ID: ${rangeId}`);
  const current = document.fixedRanges[index];
  const candidate = new FixedRange({
    id: current.id,
    kind: changes.kind ?? current.kind,
    color: changes.color ?? current.color,
    priority: changes.priority ?? current.priority ?? 0,
    cells: changes.cells ?? current.cells,
  });
  const others = document.fixedRanges.filter(item => item.id !== rangeId);
  const owners = new Set(others.flatMap(range => range.cells.map(cell => cell.join(","))));
  if (candidate.cells.some(cell => owners.has(cell.join(",")))) {
    throw new RangeError("A fixed range cannot overlap another fixed range.");
  }
  document.fixedRanges[index] = candidate;
  validateTemplateState();
  return cloneFixedRange(candidate);
}

export function deleteFixedRange(rangeId) {
  ensureTemplateWritable();
  const index = document.fixedRanges.findIndex(item => item.id === rangeId);
  if (index < 0) throw new RangeError(`Unknown fixed range ID: ${rangeId}`);
  const [removed] = document.fixedRanges.splice(index, 1);
  return cloneFixedRange(removed);
}

export function restoreFixedRanges(ranges) {
  ensureTemplateWritable();
  const restored = ranges.map(item => new FixedRange({
    ...item,
    priority: item.priority ?? 0,
  }));
  new MapDocument({ ...document, fixedRanges: restored });
  document.fixedRanges = restored;
  validateTemplateState();
  return getDocument().fixedRanges;
}

function cloneDocument(source) {
  return new MapDocument({
    title: source.title,
    buildingTypes: source.buildingTypes.map(item => ({ ...item })),
    buildings: source.buildings.map(item => ({ ...item })),
    ranges: source.ranges.map(item => ({ ...item, cells: item.cells.map(cell => [...cell]) })),
    fixedBuildingTypes: source.fixedBuildingTypes.map(item => ({ ...item })),
    fixedBuildings: source.fixedBuildings.map(item => ({ ...item })),
    fixedRanges: source.fixedRanges.map(item => ({ ...item, cells: item.cells.map(cell => [...cell]) })),
    view: { ...source.view },
  });
}

function cloneFixedBuilding(item) {
  return new FixedBuilding({
    id: item.id,
    name: item.name,
    type_id: item.typeId,
    x: item.x,
    y: item.y,
    width: item.width,
    height: item.height,
    color: item.color,
    priority: item.priority ?? 0,
  });
}

function cloneFixedRange(item) {
  return new FixedRange({
    id: item.id,
    kind: item.kind,
    color: item.color,
    priority: item.priority ?? 0,
    cells: item.cells.map(cell => [...cell]),
  });
}

function requireFixedBuildingType(id) {
  const item = document.fixedBuildingTypes.find(type => type.id === id);
  if (!item) throw new RangeError(`Unknown fixed building type ID: ${id}`);
  return item;
}

function validateTemplateState() {
  new MapDocument({
    title: "Template",
    fixedBuildingTypes: document.fixedBuildingTypes,
    fixedBuildings: document.fixedBuildings,
    fixedRanges: document.fixedRanges,
    view: document.view,
  });
  new OccupancyManager(document.fixedBuildings);
}

function rebuildOccupancy() {
  occupancy = new OccupancyManager([...document.fixedBuildings, ...document.buildings]);
}

function requireDocument() {
  if (!document) throw new Error("No map document is loaded.");
}

function requireUserBuilding(id) {
  const item = document.buildings.find(building => building.id === id);
  if (!item) {
    if (document.fixedBuildings.some(building => building.id === id)) {
      throw new RangeError("Fixed buildings cannot be modified by the regular editor.");
    }
    throw new RangeError(`Unknown building ID: ${id}`);
  }
  return item;
}

function ensureWritable() {
  requireDocument();
  if (readOnly) throw new Error("The map is read-only.");
}

function ensureTemplateWritable() {
  ensureWritable();
  if (documentMode !== "template") throw new Error("Fixed template editing is only available in template mode.");
}

export const PNSMapEngine = {
  createNewDocument,
  createTemplateDocument,
  loadTemplateDocument,
  exportTemplateDocument,
  initialMapView,
  loadDocument,
  exportDocument,
  getDocument,
  getDocumentMode,
  getOccupancy,
  isReadOnly,
  getView,
  setView,
  canPlaceBuilding,
  addBuilding,
  moveBuilding,
  deleteBuilding,
  deleteBuildings,
  restoreBuildings,
  editBuilding,
  restoreBuildingState,
  editBuildingType,
  commitRange,
  editRange,
  deleteRange,
  restoreRanges,
  addFixedBuildingType,
  editFixedBuildingType,
  deleteFixedBuildingType,
  canPlaceFixedBuilding,
  addFixedBuilding,
  moveFixedBuilding,
  editFixedBuilding,
  deleteFixedBuilding,
  deleteFixedBuildings,
  restoreFixedBuildings,
  restoreFixedBuildingState,
  commitFixedRange,
  editFixedRange,
  deleteFixedRange,
  restoreFixedRanges,
};

if (typeof window !== "undefined") window.PNSMapEngine = PNSMapEngine;
export default PNSMapEngine;
