import { Building, BuildingType, FixedBuilding, FixedBuildingType, FixedRange, MapDocument, MapRange, isValidMapCell } from "./editor-model.js";
import { OccupancyManager } from "./editor-occupancy.js";

export const DOCUMENT_FORMAT = "isometric-map-editor";
export const DOCUMENT_VERSION = 1;
export class DocumentError extends Error {}
const MAP_INFO = { min_x: 0, max_x: 511, min_y: 0, max_y: 1023 };

export function serializeDocument(document) {
  if (!(document instanceof MapDocument)) throw new DocumentError("Expected a MapDocument.");
  document.validate(); new OccupancyManager([...document.fixedBuildings, ...document.buildings]); validateView(document.view);
  return structuredCloneSafe({ format: DOCUMENT_FORMAT, version: DOCUMENT_VERSION, title: document.title, map: MAP_INFO,
    building_types: document.buildingTypes.map(({ id, name, color }) => ({ id, name, color })),
    buildings: document.buildings.map(item => ({ id: item.id, name: item.name, type_id: item.typeId, x: item.x, y: item.y, width: item.width, height: item.height, affiliation: item.affiliation, locked: item.locked })),
    ranges: document.ranges.map(item => ({
      id: item.id,
      kind: item.kind,
      color: item.color,
      locked: item.locked,
      cells: item.cells.map(cell => [...cell]),
      ...(item.presetId
        ? {
            preset_id:
              item.presetId,
          }
        : {}),
      ...(item.linked
        ? {
            linked: true,
            source_building_id:
              item.sourceBuildingId,
            affiliation:
              item.affiliation,
            active:
              item.active !== false,
          }
        : {}),
    })),
    fixed_building_types: document.fixedBuildingTypes.map(({ id, name, color, width, height }) => ({ id, name, color, width, height })),
    fixed_buildings: document.fixedBuildings.map(item => ({ id: item.id, name: item.name, type_id: item.typeId, x: item.x, y: item.y, color: item.color, priority: item.priority })),
    fixed_ranges: document.fixedRanges.map(item => ({ id: item.id, kind: item.kind, color: item.color, priority: item.priority, cells: item.cells.map(cell => [...cell]) })),
    view: { center_x: document.view.centerX, center_y: document.view.centerY, zoom: document.view.zoom } });
}

export function parseDocument(input) {
  const data = structuredCloneSafe(input);
  if (!isPlainObject(data)) throw new DocumentError("Document must be an object.");
  if (data.format !== DOCUMENT_FORMAT) throw new DocumentError("Unsupported document format.");
  if (data.version !== DOCUMENT_VERSION) throw new DocumentError("Unsupported document version.");
  if (!hasExpectedMapDimensions(data.map)) throw new DocumentError("Map dimensions do not match.");
  if (!Array.isArray(data.building_types) || !Array.isArray(data.buildings) || !Array.isArray(data.ranges ?? [])) throw new DocumentError("Document collections must be arrays.");
  for (const field of ["fixed_building_types", "fixed_buildings", "fixed_ranges"]) if (data[field] !== undefined && !Array.isArray(data[field])) throw new DocumentError("Fixed document collections must be arrays.");
  const ids = new Set(data.building_types.map(item => item?.id));
  if (ids.size !== 7 || [...Array(7)].some((_, i) => !ids.has(`type-${String(i + 1).padStart(2, "0")}`))) throw new DocumentError("Building type set must contain type-01 through type-07.");
  try {
    const document = new MapDocument({ title: requireString(data.title, "title"),
      buildingTypes: data.building_types.map(item => new BuildingType({ id: requireString(item?.id, "building type id"), name: requireString(item?.name, "building type name"), color: requireString(item?.color, "building type color") })),
      buildings: data.buildings.map(item => new Building({ id: requireString(item?.id, "building id"), name: requireString(item?.name, "building name"), type_id: requireString(item?.type_id, "building type_id"), x: requireInteger(item?.x, "building x"), y: requireInteger(item?.y, "building y"), width: requireInteger(item?.width, "building width"), height: requireInteger(item?.height, "building height"), affiliation: item?.affiliation ?? "", locked: Boolean(item?.locked) })),
      ranges: (data.ranges ?? []).map(item => new MapRange({
        id: requireString(item?.id, "range id"),
        kind: requireString(item?.kind, "range kind"),
        color: requireString(item?.color, "range color"),
        locked: Boolean(item?.locked),
        cells: item?.cells,
        linked: Boolean(item?.linked),
        source_building_id:
          item?.source_building_id ??
          null,
        affiliation:
          item?.affiliation ??
          "",
        active:
          item?.active !== false,
        preset_id:
          item?.preset_id ??
          null,
      })),
      fixedBuildingTypes: (data.fixed_building_types ?? []).map(item => new FixedBuildingType({ id: requireString(item?.id, "fixed building type id"), name: requireString(item?.name, "fixed building type name"), color: requireString(item?.color, "fixed building type color"), width: requireInteger(item?.width, "fixed building type width"), height: requireInteger(item?.height, "fixed building type height") })),
      fixedBuildings: (data.fixed_buildings ?? []).map(item => new FixedBuilding({ id: requireString(item?.id, "fixed building id"), name: requireString(item?.name, "fixed building name"), type_id: requireString(item?.type_id, "fixed building type_id"), x: requireInteger(item?.x, "fixed building x"), y: requireInteger(item?.y, "fixed building y"), color: item?.color ?? (data.fixed_building_types ?? []).find(type => type?.id === item?.type_id)?.color ?? "#EEEEEE", priority: Number.isInteger(item?.priority) ? item.priority : 0, width: (data.fixed_building_types ?? []).find(type => type?.id === item?.type_id)?.width, height: (data.fixed_building_types ?? []).find(type => type?.id === item?.type_id)?.height })),
      fixedRanges: (data.fixed_ranges ?? []).map(item => new FixedRange({ id: requireString(item?.id, "fixed range id"), kind: requireString(item?.kind, "fixed range kind"), color: requireString(item?.color, "fixed range color"), priority: Number.isInteger(item?.priority) ? item.priority : 0, cells: item?.cells })),
      view: { centerX: requireInteger(data.view?.center_x, "view.center_x"), centerY: requireInteger(data.view?.center_y, "view.center_y"), zoom: requireNumber(data.view?.zoom, "view.zoom") } });
    new OccupancyManager([...document.fixedBuildings, ...document.buildings]); validateView(document.view); return document;
  } catch (error) { if (error instanceof DocumentError) throw error; throw new DocumentError(error.message, { cause: error }); }
}
function validateView(view) { if (!isValidMapCell(view.centerX, view.centerY)) throw new DocumentError("View center is invalid."); if (view.zoom < 0.01 || view.zoom > 4) throw new DocumentError("View zoom is invalid."); }
function requireString(value, name) { if (typeof value !== "string") throw new DocumentError(`${name} must be a string.`); return value; }
function requireInteger(value, name) { if (!Number.isInteger(value)) throw new DocumentError(`${name} must be an integer.`); return value; }
function requireNumber(value, name) { if (typeof value !== "number" || !Number.isFinite(value)) throw new DocumentError(`${name} must be a number.`); return value; }
function isPlainObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function hasExpectedMapDimensions(value) {
  if (!isPlainObject(value)) return false;
  const keys = Object.keys(value);
  return keys.length === 4 && Object.entries(MAP_INFO).every(([key, expected]) => value[key] === expected);
}
function structuredCloneSafe(value) { try { return structuredClone(value); } catch { return JSON.parse(JSON.stringify(value)); } }
