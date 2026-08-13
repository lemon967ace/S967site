import {
  FixedBuilding,
  FixedBuildingType,
  FixedRange,
  MapDocument,
  BuildingType,
  isValidMapCell,
} from "./editor-model.js";
import { OccupancyManager } from "./editor-occupancy.js";
import { parseDocument } from "./editor-document.js";

export const TEMPLATE_FORMAT = "pns-map-template";
export const TEMPLATE_VERSION = 2;
export class TemplateError extends Error {}

const MAP_INFO = {
  min_x: 0,
  max_x: 511,
  min_y: 0,
  max_y: 1023,
};

const COLORS = [
  "#4E79A7",
  "#F28E2B",
  "#E15759",
  "#76B7B2",
  "#59A14F",
  "#EDC948",
  "#B07AA1",
];

export function parseTemplate(input) {
  const data = structuredCloneSafe(input);
  if (!plain(data) || data.format !== TEMPLATE_FORMAT) throw new TemplateError("Unsupported template format.");
  if (![1, TEMPLATE_VERSION].includes(data.version)) throw new TemplateError("Unsupported template version.");
  if (!plain(data.map) || Object.keys(data.map).length !== 4 || Object.entries(MAP_INFO).some(([key, value]) => data.map[key] !== value)) {
    throw new TemplateError("Template map dimensions do not match.");
  }
  for (const field of ["fixed_building_types", "fixed_buildings", "fixed_ranges"]) {
    if (!Array.isArray(data[field])) throw new TemplateError("Template collections must be arrays.");
  }

  try {
    const fixedBuildingTypes = data.fixed_building_types.map(item => new FixedBuildingType({
      id: string(item?.id),
      name: string(item?.name),
      color: string(item?.color),
      width: integer(item?.width),
      height: integer(item?.height),
    }));

    const types = new Map(fixedBuildingTypes.map(item => [item.id, item]));

    const fixedBuildings = data.fixed_buildings.map(item => {
      const type = types.get(item?.type_id);
      return new FixedBuilding({
        id: string(item?.id),
        name: string(item?.name),
        type_id: string(item?.type_id),
        x: integer(item?.x),
        y: integer(item?.y),
        width: type?.width,
        height: type?.height,
        color: item?.color ?? type?.color ?? "#EEEEEE",
        priority: optionalInteger(item?.priority, 0),
      });
    });

    const fixedRanges = data.fixed_ranges.map(item => new FixedRange({
      id: string(item?.id),
      kind: string(item?.kind),
      color: string(item?.color),
      priority: optionalInteger(item?.priority, 0),
      cells: item?.cells,
    }));

    const view = {
      centerX: integer(data.view?.center_x),
      centerY: integer(data.view?.center_y),
      zoom: number(data.view?.zoom),
    };

    const validation = new MapDocument({
      title: "Template",
      fixedBuildingTypes,
      fixedBuildings,
      fixedRanges,
      view,
    });

    new OccupancyManager(validation.fixedBuildings);
    validateView(view);

    return {
      fixedBuildingTypes: validation.fixedBuildingTypes,
      fixedBuildings: validation.fixedBuildings,
      fixedRanges: validation.fixedRanges,
      view: { ...view },
    };
  } catch (error) {
    if (error instanceof TemplateError) throw error;
    throw new TemplateError(error.message, { cause: error });
  }
}

export function serializeTemplate(input) {
  const template = input?.fixedBuildingTypes
    ? parseTemplate({
        format: TEMPLATE_FORMAT,
        version: TEMPLATE_VERSION,
        map: MAP_INFO,
        fixed_building_types: input.fixedBuildingTypes.map(item => ({
          id: item.id,
          name: item.name,
          color: item.color,
          width: item.width,
          height: item.height,
        })),
        fixed_buildings: input.fixedBuildings.map(item => ({
          id: item.id,
          name: item.name,
          type_id: item.typeId,
          x: item.x,
          y: item.y,
          color: item.color,
          priority: item.priority ?? 0,
        })),
        fixed_ranges: input.fixedRanges.map(item => ({
          id: item.id,
          kind: item.kind,
          color: item.color,
          priority: item.priority ?? 0,
          cells: item.cells,
        })),
        view: {
          center_x: input.view.centerX,
          center_y: input.view.centerY,
          zoom: input.view.zoom,
        },
      })
    : parseTemplate(input);

  return {
    format: TEMPLATE_FORMAT,
    version: TEMPLATE_VERSION,
    map: { ...MAP_INFO },
    fixed_building_types: template.fixedBuildingTypes.map(item => ({
      id: item.id,
      name: item.name,
      color: item.color,
      width: item.width,
      height: item.height,
    })),
    fixed_buildings: template.fixedBuildings.map(item => ({
      id: item.id,
      name: item.name,
      type_id: item.typeId,
      x: item.x,
      y: item.y,
      color: item.color,
      priority: item.priority ?? 0,
    })),
    fixed_ranges: template.fixedRanges.map(item => ({
      id: item.id,
      kind: item.kind,
      color: item.color,
      priority: item.priority ?? 0,
      cells: item.cells.map(cell => [...cell]),
    })),
    view: {
      center_x: template.view.centerX,
      center_y: template.view.centerY,
      zoom: template.view.zoom,
    },
  };
}

export function applyTemplateToNewDocument(input, { title = "Untitled Map" } = {}) {
  const template = input?.fixedBuildingTypes
    ? parseTemplate(serializeTemplate(input))
    : parseTemplate(input);

  return new MapDocument({
    title,
    buildingTypes: COLORS.map((color, i) => new BuildingType({
      id: `type-${String(i + 1).padStart(2, "0")}`,
      name: `건물 종류 ${i + 1}`,
      color,
    })),
    buildings: [],
    ranges: [],
    fixedBuildingTypes: template.fixedBuildingTypes,
    fixedBuildings: template.fixedBuildings,
    fixedRanges: template.fixedRanges,
    view: template.view,
  });
}

export function convertDocumentToTemplate(input) {
  const source = parseDocument(input);

  const usedTypeIds = new Set(source.fixedBuildingTypes.map(item => item.id));
  const usedBuildingIds = new Set(source.fixedBuildings.map(item => item.id));
  const usedRangeIds = new Set(source.fixedRanges.map(item => item.id));
  const typeSource = new Map(source.buildingTypes.map(item => [item.id, item]));

  const combos = new Map();
  for (const building of source.buildings) {
    combos.set(`${building.typeId}|${building.width}|${building.height}`, {
      typeId: building.typeId,
      width: building.width,
      height: building.height,
    });
  }

  const comboCounts = new Map();
  for (const combo of combos.values()) {
    comboCounts.set(combo.typeId, (comboCounts.get(combo.typeId) || 0) + 1);
  }

  const comboIds = new Map();
  const newTypes = [];

  for (const [key, combo] of combos) {
    const original = typeSource.get(combo.typeId);
    const id = unique(`${combo.typeId}-${combo.width}x${combo.height}`, usedTypeIds);
    comboIds.set(key, id);
    newTypes.push(new FixedBuildingType({
      id,
      name: comboCounts.get(combo.typeId) > 1
        ? `${original.name} (${combo.width}x${combo.height})`
        : original.name,
      color: original.color,
      width: combo.width,
      height: combo.height,
    }));
  }

  const convertedBuildings = source.buildings.map(item => {
    const sourceType = typeSource.get(item.typeId);
    return new FixedBuilding({
      id: unique(item.id, usedBuildingIds),
      name: item.name,
      type_id: comboIds.get(`${item.typeId}|${item.width}|${item.height}`),
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height,
      color: sourceType?.color ?? "#EEEEEE",
      priority: 0,
    });
  });

  const convertedRanges = source.ranges.map(item => new FixedRange({
    id: unique(item.id, usedRangeIds),
    kind: item.kind,
    color: item.color,
    priority: 0,
    cells: item.cells,
  }));

  const document = new MapDocument({
    title: "Template",
    fixedBuildingTypes: [...source.fixedBuildingTypes, ...newTypes],
    fixedBuildings: [...source.fixedBuildings, ...convertedBuildings],
    fixedRanges: [...source.fixedRanges, ...convertedRanges],
    view: source.view,
  });

  new OccupancyManager(document.fixedBuildings);
  return serializeTemplate(document);
}

function unique(base, ids) {
  let value = base;
  let number = 2;
  while (ids.has(value)) value = `${base}-${number++}`;
  ids.add(value);
  return value;
}

function string(value) {
  if (typeof value !== "string") throw new TemplateError("Template string field is invalid.");
  return value;
}

function integer(value) {
  if (!Number.isInteger(value)) throw new TemplateError("Template integer field is invalid.");
  return value;
}

function optionalInteger(value, fallback) {
  if (value === undefined || value === null) return fallback;
  return integer(value);
}

function number(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new TemplateError("Template number field is invalid.");
  return value;
}

function plain(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateView(view) {
  if (!isValidMapCell(view.centerX, view.centerY) || view.zoom < 0.01 || view.zoom > 4) {
    throw new TemplateError("Template view is invalid.");
  }
}

function structuredCloneSafe(value) {
  try { return structuredClone(value); }
  catch { return JSON.parse(JSON.stringify(value)); }
}
