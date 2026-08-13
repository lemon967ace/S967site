export const MAP_MIN_X = 0;
export const MAP_MAX_X = 511;
export const MAP_MIN_Y = 0;
export const MAP_MAX_Y = 1023;

export function createUniqueId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `pns-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function validateNonEmptyText(value, fieldName) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${fieldName} must be a non-empty string.`);
  }
  return value.trim();
}

export function validateColor(value, fieldName) {
  if (typeof value !== "string") throw new TypeError(`${fieldName} must be a color string.`);
  const raw = value.trim();
  if (/^#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?$/.test(raw)) {
    return raw.toUpperCase();
  }
  const rgbMatch = raw.match(/^(?:rgb\(\s*)?(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*\))?$/i);
  if (rgbMatch) {
    const channels = rgbMatch.slice(1).map(Number);
    if (channels.every(channel => Number.isInteger(channel) && channel >= 0 && channel <= 255)) {
      return `#${channels.map(channel => channel.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
    }
  }
  throw new TypeError(`${fieldName} must be HEX (#RRGGBB) or RGB (255,255,255).`);
}

export function validatePriority(value, fieldName = "Priority") {
  if (!Number.isInteger(value)) throw new TypeError(`${fieldName} must be an integer.`);
  return value;
}

export function isCoordinateInsideMap(x, y) {
  return Number.isInteger(x) && Number.isInteger(y) &&
    x >= MAP_MIN_X && x <= MAP_MAX_X && y >= MAP_MIN_Y && y <= MAP_MAX_Y;
}

export function isValidMapCell(x, y) {
  return isCoordinateInsideMap(x, y) && Math.abs(x % 2) === Math.abs(y % 2);
}

export class BuildingType {
  constructor({ name, color, id = createUniqueId() }) {
    this.id = validateNonEmptyText(id, "Building type ID");
    this.name = validateNonEmptyText(name, "Building type name");
this.color = validateColor(color, "Building type color");
  }
}

export class FixedBuildingType extends BuildingType {
  constructor({ width = 1, height = 1, ...data }) {
    super(data);
    if (!((width === 1 && height === 1) || (width === 2 && height === 2))) throw new RangeError("Fixed building type size must be 1x1 or 2x2.");
    this.width = width; this.height = height;
  }
}

export class Building {
  constructor({ name, typeId, type_id, x, y, width, height, affiliation = "", locked = false, id = createUniqueId() }) {
    this.id = validateNonEmptyText(id, "Building ID");
    this.name = validateNonEmptyText(name, "Building name");
    this.typeId = validateNonEmptyText(typeId ?? type_id, "Building type ID");
    if (typeof affiliation !== "string") throw new TypeError("Building affiliation must be a string.");
    this.affiliation = affiliation.trim();
    if (this.affiliation && (this.affiliation.length !== 3 || [...this.affiliation].some(c => c.charCodeAt(0) < 33 || c.charCodeAt(0) > 126))) {
      throw new RangeError("Building affiliation must be exactly three printable ASCII characters.");
    }
    if (!Number.isInteger(x) || !Number.isInteger(y)) throw new TypeError("Building coordinates must be integers.");
    if (!((width === 1 && height === 1) || (width === 2 && height === 2))) {
      throw new RangeError("Building size must be 1x1 or 2x2.");
    }
    this.x = x; this.y = y; this.width = width; this.height = height; this.locked = Boolean(locked);
    const invalid = this.occupiedCells().filter(([cellX, cellY]) => !isValidMapCell(cellX, cellY));
    if (invalid.length) throw new RangeError(`Building is outside the map: ${JSON.stringify(invalid)}`);
  }

  get type_id() { return this.typeId; }

  occupiedCells() {
    if (this.width === 1) return [[this.x, this.y]];
    return [[this.x - 1, this.y - 1], [this.x, this.y - 2], [this.x + 1, this.y - 1], [this.x, this.y]];
  }
}

export class FixedBuilding extends Building {
  constructor({ color = "#EEEEEE", priority = 0, ...data }) {
    super({ ...data, affiliation: "", locked: true });
    this.color = validateColor(color, "Fixed building color");
    this.priority = validatePriority(priority, "Fixed building priority");
    this.fixed = true;
  }
}

export class MapRange {
  constructor({ kind, color, locked = false, cells, id = createUniqueId() }) {
    this.id = validateNonEmptyText(id, "Range ID");
    this.kind = validateNonEmptyText(kind, "Range kind");
this.color = validateColor(color, "Range color");
    if (!new Set(["allowed", "blocked"]).has(this.kind)) throw new RangeError("Range kind must be allowed or blocked.");
    if (!Array.isArray(cells)) throw new TypeError("Range cells must be an array.");
    const unique = new Map(cells.map(cell => {
      if (!Array.isArray(cell) || cell.length !== 2 || !isValidMapCell(cell[0], cell[1])) throw new RangeError("Range contains an invalid map cell.");
      return [`${cell[0]},${cell[1]}`, [cell[0], cell[1]]];
    }));
    if (!unique.size) throw new RangeError("Range must contain at least one cell.");
    this.cells = [...unique.values()]; this.locked = Boolean(locked);
  }
}

export class FixedRange extends MapRange {
  constructor({ priority = 0, ...data }) {
    super({ ...data, locked: true });
    this.priority = validatePriority(priority, "Fixed range priority");
    this.fixed = true;
  }
}

export function buildRangeCellOwnerIndex({ fixedRanges = [], ranges = [] }, { throwOnOverlap = false } = {}) {
  const owners = new Map();
  for (const [layer, items] of [["fixed", fixedRanges], ["user", ranges]]) for (const range of items) for (const cell of range.cells) {
    const key = cell.join(","), existing = owners.get(key);
    if (existing && throwOnOverlap) throw new RangeError(`Overlapping range cell: ${key}`);
    if (!existing) owners.set(key, { layer, rangeId: range.id, range, cell: [...cell] });
  }
  return owners;
}

export class MapDocument {
  constructor({ title, buildingTypes = [], buildings = [], ranges = [], fixedBuildingTypes = [], fixedBuildings = [], fixedRanges = [], view = { centerX: 0, centerY: 0, zoom: 1 } }) {
    this.title = validateNonEmptyText(title, "Map title");
    this.buildingTypes = buildingTypes.map(item => item instanceof BuildingType ? item : new BuildingType(item));
    this.buildings = buildings.map(item => item instanceof Building ? item : new Building(item));
    this.ranges = ranges.map(item => item instanceof MapRange ? item : new MapRange(item));
    this.fixedBuildingTypes = fixedBuildingTypes.map(item => item instanceof FixedBuildingType ? item : new FixedBuildingType(item));
    const fixedTypesById = new Map(this.fixedBuildingTypes.map(item => [item.id, item]));
    this.fixedBuildings = fixedBuildings.map(item => { const type = fixedTypesById.get(item.typeId ?? item.type_id); return item instanceof FixedBuilding ? item : new FixedBuilding({ ...item, color: item.color ?? type?.color ?? "#EEEEEE", priority: item.priority ?? 0, width: item.width ?? type?.width, height: item.height ?? type?.height }); });
    this.fixedRanges = fixedRanges.map(item => item instanceof FixedRange ? item : new FixedRange(item));
    this.view = { centerX: view.centerX ?? view.center_x, centerY: view.centerY ?? view.center_y, zoom: view.zoom };
    this.validate();
  }

  validate() {
    for (const [label, items] of [["building type", this.buildingTypes], ["building", this.buildings], ["range", this.ranges], ["fixed building type", this.fixedBuildingTypes], ["fixed building", this.fixedBuildings], ["fixed range", this.fixedRanges]]) {
      const ids = new Set();
      for (const item of items) { if (ids.has(item.id)) throw new RangeError(`Duplicate ${label} ID: ${item.id}`); ids.add(item.id); }
    }
    const typeIds = new Set(this.buildingTypes.map(item => item.id));
    for (const building of this.buildings) if (!typeIds.has(building.typeId)) throw new RangeError(`Unknown building type ID: ${building.typeId}`);
    const fixedTypeIds = new Set(this.fixedBuildingTypes.map(item => item.id));
    const fixedTypes = new Map(this.fixedBuildingTypes.map(item => [item.id, item]));
    for (const building of this.fixedBuildings) { const type = fixedTypes.get(building.typeId); if (!fixedTypeIds.has(building.typeId)) throw new RangeError(`Unknown fixed building type ID: ${building.typeId}`); if (building.width !== type.width || building.height !== type.height) throw new RangeError("Fixed building size must match its type."); }
    buildRangeCellOwnerIndex(this, { throwOnOverlap: true });
  }
}
