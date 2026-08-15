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
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
      throw new RangeError("Fixed building type width and height must be positive integers.");
    }
    this.width = width;
    this.height = height;
  }
}

export class Building {
  constructor({ name, typeId, type_id, x, y, width, height, affiliation = "", locked = false, id = createUniqueId(), allowAnySize = false }) {
    this.id = validateNonEmptyText(id, "Building ID");
    this.name = validateNonEmptyText(name, "Building name");
    this.typeId = validateNonEmptyText(typeId ?? type_id, "Building type ID");
    if (typeof affiliation !== "string") throw new TypeError("Building affiliation must be a string.");
    this.affiliation = affiliation.trim();
    if (this.affiliation && (this.affiliation.length !== 3 || [...this.affiliation].some(c => c.charCodeAt(0) < 33 || c.charCodeAt(0) > 126))) {
      throw new RangeError("Building affiliation must be exactly three printable ASCII characters.");
    }
    if (!Number.isInteger(x) || !Number.isInteger(y)) throw new TypeError("Building coordinates must be integers.");
    if (
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      width < 1 ||
      height < 1 ||
      (!allowAnySize && !((width === 1 && height === 1) || (width === 2 && height === 2)))
    ) {
      throw new RangeError(
        allowAnySize
          ? "Building width and height must be positive integers."
          : "Building size must be 1x1 or 2x2."
      );
    }
    this.x = x; this.y = y; this.width = width; this.height = height; this.locked = Boolean(locked);
    const invalid = this.occupiedCells().filter(([cellX, cellY]) => !isValidMapCell(cellX, cellY));
    if (invalid.length) throw new RangeError(`Building is outside the map: ${JSON.stringify(invalid)}`);
  }

  get type_id() { return this.typeId; }

  occupiedCells() {
    const cells = [];
    for (let row = 0; row < this.height; row++) {
      for (let column = 0; column < this.width; column++) {
        const dx = column - row;
        const dy = -(column + row);
        cells.push([this.x + dx, this.y + dy]);
      }
    }
    return cells;
  }
}

export class FixedBuilding extends Building {
  constructor({ color = "#EEEEEE", priority = 0, locked = true, ...data }) {
    super({
      ...data,
      affiliation: "",
      locked: Boolean(locked),
      allowAnySize: true,
    });
    this.color = validateColor(color, "Fixed building color");
    this.priority = validatePriority(priority, "Fixed building priority");
    this.fixed = true;
  }
}

export class MapRange {
  constructor({
    kind,
    color,
    locked = false,
    cells,
    id = createUniqueId(),
    linked = false,
    sourceBuildingId = null,
    source_building_id = null,
    affiliation = "",
    active = true,
    presetId = null,
    preset_id = null,
  }) {
    this.id =
      validateNonEmptyText(
        id,
        "Range ID"
      );
    this.kind =
      validateNonEmptyText(
        kind,
        "Range kind"
      );
    this.color =
      validateColor(
        color,
        "Range color"
      );

    if (
      !new Set([
        "allowed",
        "blocked",
      ]).has(this.kind)
    ) {
      throw new RangeError(
        "Range kind must be allowed or blocked."
      );
    }

    if (!Array.isArray(cells)) {
      throw new TypeError(
        "Range cells must be an array."
      );
    }

    const unique =
      new Map(
        cells.map(cell => {
          if (
            !Array.isArray(cell) ||
            cell.length !== 2 ||
            !isValidMapCell(
              cell[0],
              cell[1]
            )
          ) {
            throw new RangeError(
              "Range contains an invalid map cell."
            );
          }

          return [
            `${cell[0]},${cell[1]}`,
            [cell[0], cell[1]],
          ];
        })
      );

    if (!unique.size) {
      throw new RangeError(
        "Range must contain at least one cell."
      );
    }

    this.cells =
      [...unique.values()];

    const effectivePresetId =
      presetId ??
      preset_id;

    this.presetId =
      effectivePresetId == null
        ? null
        : validateNonEmptyText(
            effectivePresetId,
            "Range preset ID"
          );

    this.linked =
      Boolean(linked);

    const sourceId =
      sourceBuildingId ??
      source_building_id;

    if (this.linked) {
      this.sourceBuildingId =
        validateNonEmptyText(
          sourceId,
          "Linked range source building ID"
        );

      if (
        typeof affiliation !==
        "string"
      ) {
        throw new TypeError(
          "Linked range affiliation must be a string."
        );
      }

      this.affiliation =
        affiliation.trim();
      this.active =
        active !== false;

      if (
        this.affiliation &&
        (
          this.affiliation.length !==
            3 ||
          [...this.affiliation].some(
            c =>
              c.charCodeAt(0) <
                33 ||
              c.charCodeAt(0) >
                126
          )
        )
      ) {
        throw new RangeError(
          "Linked range affiliation must be exactly three printable ASCII characters."
        );
      }

      /*
        Building-linked ranges are system controlled.
        The user may change their affiliation color through the dedicated
        affiliation-color control, but cannot unlock/edit/delete the range.
      */
      this.locked = true;
    } else {
      this.sourceBuildingId =
        null;
      this.affiliation = "";
      this.active = true;
      this.locked =
        Boolean(locked);
    }
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
    for (
      const range
      of this.ranges
    ) {
      if (!range.linked) {
        continue;
      }

      const source =
        this.buildings.find(
          item =>
            item.id ===
              range.sourceBuildingId
        );

      if (!source) {
        throw new RangeError(
          `Linked range source building not found: ${range.sourceBuildingId}`
        );
      }

      if (
        source.typeId !==
          "type-01"
      ) {
        throw new RangeError(
          "Linked ranges must belong to type-01 alliance structures."
        );
      }
    }

    const fixedTypeIds = new Set(this.fixedBuildingTypes.map(item => item.id));
    const fixedTypes = new Map(this.fixedBuildingTypes.map(item => [item.id, item]));
    for (const building of this.fixedBuildings) { const type = fixedTypes.get(building.typeId); if (!fixedTypeIds.has(building.typeId)) throw new RangeError(`Unknown fixed building type ID: ${building.typeId}`); if (building.width !== type.width || building.height !== type.height) throw new RangeError("Fixed building size must match its type."); }
    /*
      User-range overlap policy:
      - ordinary user ranges still may not overlap one another
      - linked alliance ranges may overlap according to their special rules
      - linked territory may overlap Mountain
      - all user ranges may overlap fixed/base-map ranges

      Fixed/base-map terrain and user ranges are separate layers.
      Buildability is resolved by placement rules: any blocked layer wins.
    */
    for (
      let i = 0;
      i < this.ranges.length;
      i++
    ) {
      const left =
        this.ranges[i];
      const leftCells =
        new Set(
          left.cells.map(
            cell => cell.join(",")
          )
        );

      for (
        let j = i + 1;
        j < this.ranges.length;
        j++
      ) {
        const right =
          this.ranges[j];

        if (
          (
            left.linked &&
            right.linked
          ) ||
          (
            left.linked &&
            right.presetId ===
              "mountain"
          ) ||
          (
            right.linked &&
            left.presetId ===
              "mountain"
          )
        ) {
          continue;
        }

        if (
          right.cells.some(
            cell =>
              leftCells.has(
                cell.join(",")
              )
          )
        ) {
          throw new RangeError(
            "Overlapping range cell."
          );
        }
      }


    }
  }
}
