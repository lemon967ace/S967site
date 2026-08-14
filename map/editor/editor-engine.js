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
  createUniqueId,
  isValidMapCell,
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

export const ALLIANCE_STRUCTURE_TYPE_ID =
  "type-01";

const DEFAULT_LINKED_RANGE_COLOR =
  "#B07AA1";

function gridToUv(
  x,
  y
) {
  return [
    (x + y) / 2,
    (y - x) / 2,
  ];
}

function uvToGrid(
  u,
  v
) {
  return [
    u - v,
    u + v,
  ];
}

function specialStructureRole(
  building
) {
  if (
    building?.typeId !==
    ALLIANCE_STRUCTURE_TYPE_ID
  ) {
    return null;
  }

  if (
    building.width === 2 &&
    building.height === 2
  ) {
    return "fort";
  }

  if (
    building.width === 1 &&
    building.height === 1
  ) {
    return "outpost";
  }

  return null;
}

/*
  Linked territory shape.

  1x1:
    building itself excluded; 5 cells outward on all four u/v sides.

  2x2 fort:
    building footprint excluded;
    +u and +v = 6 cells;
    -u and -v = 5 cells.

  Returning null means the complete requested territory would extend
  outside the valid map, so placement must be rejected rather than clipping it.
*/
export function linkedRangeCellsForBuilding(
  building
) {
  const role =
    specialStructureRole(
      building
    );

  if (!role) {
    return [];
  }

  const occupied =
    building.occupiedCells();
  const uv =
    occupied.map(
      ([x, y]) =>
        gridToUv(x, y)
    );

  const minU =
    Math.min(
      ...uv.map(
        item => item[0]
      )
    );
  const maxU =
    Math.max(
      ...uv.map(
        item => item[0]
      )
    );
  const minV =
    Math.min(
      ...uv.map(
        item => item[1]
      )
    );
  const maxV =
    Math.max(
      ...uv.map(
        item => item[1]
      )
    );

  const negative =
    5;
  const positive =
    role === "fort"
      ? 6
      : 5;

  const occupiedKeys =
    new Set(
      occupied.map(
        cell =>
          cell.join(",")
      )
    );

  const cells = [];

  for (
    let u =
      minU - negative;
    u <=
      maxU + positive;
    u++
  ) {
    for (
      let v =
        minV - negative;
      v <=
        maxV + positive;
      v++
    ) {
      const cell =
        uvToGrid(u, v);

      if (
        !isValidMapCell(
          ...cell
        )
      ) {
        return null;
      }

      if (
        !occupiedKeys.has(
          cell.join(",")
        )
      ) {
        cells.push(cell);
      }
    }
  }

  return cells;
}

function linkedRangeForBuilding(
  building
) {
  return document.ranges.find(
    item =>
      item.linked &&
      item.sourceBuildingId ===
        building.id
  ) ?? null;
}

function affiliationColor(
  affiliation,
  excludeRangeId = null
) {
  const match =
    document.ranges.find(
      item =>
        item.linked &&
        item.id !==
          excludeRangeId &&
        item.affiliation ===
          affiliation
    );

  return (
    match?.color ??
    DEFAULT_LINKED_RANGE_COLOR
  );
}

function linkedCellsConflictWithManualRange(
  cells,
  ignoreLinkedRangeId = null
) {
  const keys =
    new Set(
      cells.map(
        cell =>
          cell.join(",")
      )
    );

  return document.ranges.some(
    range =>
      range.id !==
        ignoreLinkedRangeId &&
      !range.linked &&
      range.presetId !==
        "mountain" &&
      range.cells.some(
        cell =>
          keys.has(
            cell.join(",")
          )
      )
  );
}

function isOutpostInsideOwnLinkedTerritory(
  building,
  ignoreBuildingId = null
) {
  const cell =
    building.occupiedCells()[0];

  return document.ranges.some(
    range => {
      if (
        !range.linked ||
        range.active === false ||
        range.affiliation !==
          building.affiliation
      ) {
        return false;
      }

      if (
        range.sourceBuildingId ===
          ignoreBuildingId
      ) {
        return false;
      }

      return range.cells.some(
        value =>
          value[0] ===
            cell[0] &&
          value[1] ===
            cell[1]
      );
    }
  );
}

function validateAffiliationCode(
  value
) {
  const text =
    String(
      value ??
      ""
    );

  return (
    text.length === 3 &&
    [...text].every(
      c =>
        c.charCodeAt(0) >=
          33 &&
        c.charCodeAt(0) <=
          126
    )
  );
}

function allianceStructureCounts(
  affiliation,
  ignoreBuildingId = null
) {
  let fort = 0;
  let outpost = 0;

  for (
    const building
    of document.buildings
  ) {
    if (
      building.id ===
        ignoreBuildingId ||
      building.affiliation !==
        affiliation ||
      building.typeId !==
        ALLIANCE_STRUCTURE_TYPE_ID
    ) {
      continue;
    }

    const role =
      specialStructureRole(
        building
      );

    if (role === "fort") {
      fort++;
    } else if (
      role === "outpost"
    ) {
      outpost++;
    }
  }

  return {
    fort,
    outpost,
  };
}

/*
  The central purple ground is blocked for 2x2 Fort placement
  by fixed-range color only, as requested.
*/
const FORT_BLOCKED_FIXED_RANGE_COLORS =
  new Set([
    "#b07aa1",
  ]);

function fortTouchesBlockedPurple(
  building
) {
  const occupied =
    new Set(
      building
        .occupiedCells()
        .map(
          cell =>
            cell.join(",")
        )
    );

  return document.fixedRanges.some(
    range =>
      FORT_BLOCKED_FIXED_RANGE_COLORS
        .has(
          String(
            range.color ??
            ""
          ).toLowerCase()
        ) &&
      range.cells.some(
        cell =>
          occupied.has(
            cell.join(",")
          )
      )
  );
}

function recomputeLinkedRangeActivity() {
  if (!document) {
    return;
  }

  const sourceById =
    new Map(
      document.buildings.map(
        building => [
          building.id,
          building,
        ]
      )
    );

  /*
    Rebuild the full geometric territory every time from the source building.
    This is important because a later affiliation may previously have been
    clipped by an earlier affiliation, but must regain those cells if the
    earlier territory moves away or turns OFF.
  */
  const fullCellsByRangeId =
    new Map();

  for (
    const range
    of document.ranges
  ) {
    if (!range.linked) {
      continue;
    }

    const source =
      sourceById.get(
        range.sourceBuildingId
      );

    if (!source) {
      fullCellsByRangeId.set(
        range.id,
        range.cells.map(
          cell => [...cell]
        )
      );
      continue;
    }

    const cells =
      linkedRangeCellsForBuilding(
        source
      );

    fullCellsByRangeId.set(
      range.id,
      cells ??
        range.cells.map(
          cell => [...cell]
        )
    );
  }

  const activeIds =
    new Set();

  /*
    Forts are roots. Outposts are activated only by already-active,
    actually-owned territory of the same affiliation.
  */
  for (
    const range
    of document.ranges
  ) {
    if (!range.linked) {
      continue;
    }

    const source =
      sourceById.get(
        range.sourceBuildingId
      );

    if (
      source &&
      specialStructureRole(
        source
      ) === "fort"
    ) {
      activeIds.add(
        source.id
      );
    }
  }

  function calculateOwnedTerritory(
    activeBuildingIds
  ) {
    const ownerByCell =
      new Map();
    const effectiveByRangeId =
      new Map();

    /*
      document.ranges order is installation order.
      Therefore an earlier installed affiliation claims a contested cell
      before a later affiliation sees it.

      Same-affiliation linked ranges may still overlap each other.
    */
    for (
      const range
      of document.ranges
    ) {
      if (
        !range.linked ||
        !activeBuildingIds.has(
          range.sourceBuildingId
        )
      ) {
        continue;
      }

      const fullCells =
        fullCellsByRangeId.get(
          range.id
        ) ??
        [];

      const effective = [];

      for (
        const cell
        of fullCells
      ) {
        const key =
          cell.join(",");
        const owner =
          ownerByCell.get(
            key
          );

        if (
          owner &&
          owner !==
            range.affiliation
        ) {
          continue;
        }

        effective.push(
          [...cell]
        );

        if (!owner) {
          ownerByCell.set(
            key,
            range.affiliation
          );
        }
      }

      effectiveByRangeId.set(
        range.id,
        effective
      );
    }

    return {
      ownerByCell,
      effectiveByRangeId,
    };
  }

  let changed = true;
  let ownership =
    calculateOwnedTerritory(
      activeIds
    );

  while (changed) {
    changed = false;

    for (
      const range
      of document.ranges
    ) {
      if (
        !range.linked ||
        activeIds.has(
          range.sourceBuildingId
        )
      ) {
        continue;
      }

      const source =
        sourceById.get(
          range.sourceBuildingId
        );

      if (
        !source ||
        specialStructureRole(
          source
        ) !== "outpost"
      ) {
        continue;
      }

      const ownCell =
        source
          .occupiedCells()[0]
          .join(",");

      if (
        ownership.ownerByCell.get(
          ownCell
        ) ===
          source.affiliation
      ) {
        activeIds.add(
          source.id
        );
        changed = true;
      }
    }

    if (changed) {
      ownership =
        calculateOwnedTerritory(
          activeIds
        );
    }
  }

  /*
    Final ownership pass after reachability stabilises.
  */
  ownership =
    calculateOwnedTerritory(
      activeIds
    );

  document.ranges =
    document.ranges.map(
      range => {
        if (!range.linked) {
          return range;
        }

        const active =
          activeIds.has(
            range.sourceBuildingId
          );

        return new MapRange({
          ...range,
          linked: true,
          sourceBuildingId:
            range.sourceBuildingId,
          affiliation:
            range.affiliation,
          active,
          cells:
            active
              ? (
                  ownership
                    .effectiveByRangeId
                    .get(
                      range.id
                    ) ??
                  []
                )
              : (
                  fullCellsByRangeId
                    .get(
                      range.id
                    ) ??
                  range.cells
                ),
        });
      }
    );
}

function linkedRangeCheck(
  building,
  {
    ignoreLinkedRangeId =
      null,
    ignoreBuildingId =
      null,
  } = {}
) {
  const role =
    specialStructureRole(
      building
    );

  if (!role) {
    return {
      allowed: true,
      cells: [],
      reason: null,
    };
  }

  if (
    !validateAffiliationCode(
      building.affiliation
    )
  ) {
    return {
      allowed: false,
      cells: [],
      reason:
        "INVALID_AFFILIATION",
    };
  }

  const counts =
    allianceStructureCounts(
      building.affiliation,
      ignoreBuildingId
    );

  if (
    role === "fort" &&
    counts.fort >= 1
  ) {
    return {
      allowed: false,
      cells: [],
      reason:
        "FORT_LIMIT_REACHED",
    };
  }

  if (
    role === "outpost" &&
    counts.outpost >= 5
  ) {
    return {
      allowed: false,
      cells: [],
      reason:
        "OUTPOST_LIMIT_REACHED",
    };
  }

  if (
    role === "fort" &&
    fortTouchesBlockedPurple(
      building
    )
  ) {
    return {
      allowed: false,
      cells: [],
      reason:
        "FORT_ON_PURPLE_GROUND",
    };
  }

  if (
    role === "outpost" &&
    !isOutpostInsideOwnLinkedTerritory(
      building,
      ignoreBuildingId
    )
  ) {
    return {
      allowed: false,
      cells: [],
      reason:
        "OUTPOST_OUTSIDE_OWN_RANGE",
    };
  }

  const cells =
    linkedRangeCellsForBuilding(
      building
    );

  if (!cells) {
    return {
      allowed: false,
      cells: [],
      reason:
        "LINKED_RANGE_OUTSIDE_MAP",
    };
  }

  if (
    linkedCellsConflictWithManualRange(
      cells,
      ignoreLinkedRangeId
    )
  ) {
    return {
      allowed: false,
      cells,
      reason:
        "LINKED_RANGE_OVERLAP",
    };
  }

  return {
    allowed: true,
    cells,
    reason: null,
  };
}

function upsertLinkedRange(
  building
) {
  const role =
    specialStructureRole(
      building
    );
  const existing =
    linkedRangeForBuilding(
      building
    );

  if (!role) {
    if (existing) {
      document.ranges =
        document.ranges.filter(
          item =>
            item.id !==
              existing.id
        );
    }
    return null;
  }

  const check =
    linkedRangeCheck(
      building,
      {
        ignoreLinkedRangeId:
          existing?.id ??
          null,
        ignoreBuildingId:
          building.id,
      }
    );

  if (!check.allowed) {
    throw new RangeError(
      check.reason
    );
  }

  const next =
    new MapRange({
      id:
        existing?.id ??
        createUniqueId(),
      kind: "allowed",
      color:
        affiliationColor(
          building.affiliation,
          existing?.id ??
            null
        ),
      cells:
        check.cells,
      linked: true,
      sourceBuildingId:
        building.id,
      affiliation:
        building.affiliation,
      active:
        existing?.active !== false,
    });

  if (existing) {
    const index =
      document.ranges.findIndex(
        item =>
          item.id ===
            existing.id
      );
    document.ranges[index] =
      next;
  } else {
    document.ranges.push(next);
  }

  return new MapRange(next);
}

function removeLinkedRange(
  buildingId
) {
  const removed =
    document.ranges.filter(
      item =>
        item.linked &&
        item.sourceBuildingId ===
          buildingId
    );

  document.ranges =
    document.ranges.filter(
      item =>
        !(
          item.linked &&
          item.sourceBuildingId ===
            buildingId
        )
    );

  return removed.map(
    item =>
      new MapRange(item)
  );
}

function validateSpecialCandidate(
  candidate,
  {
    ignoreBuildingId =
      null,
  } = {}
) {
  const existingRange =
    ignoreBuildingId
      ? document.ranges.find(
          item =>
            item.linked &&
            item.sourceBuildingId ===
              ignoreBuildingId
        )
      : null;

  return linkedRangeCheck(
    candidate,
    {
      ignoreLinkedRangeId:
        existingRange?.id ??
        null,
      ignoreBuildingId:
        ignoreBuildingId ??
        candidate.id,
    }
  );
}

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
  recomputeLinkedRangeActivity();
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
  recomputeLinkedRangeActivity();
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

export function canPlaceBuilding({
  x,
  y,
  width,
  height,
  typeId = null,
  type_id = null,
  affiliation = "",
  ignoreBuildingId = null,
}) {
  requireDocument();

  const result =
    occupancy.checkPosition({
      x,
      y,
      width,
      height,
      ignoreBuildingId,
    });

  const rules =
    evaluatePlacementCells(
      result.occupiedCells,
      document
    );

  let linkedRangeResult = {
    allowed: true,
    cells: [],
    reason: null,
  };

  const effectiveTypeId =
    typeId ??
    type_id;

  if (effectiveTypeId) {
    const candidate =
      new Building({
        id:
          ignoreBuildingId ??
          createUniqueId(),
        name: "Preview",
        typeId:
          effectiveTypeId,
        x,
        y,
        width,
        height,
        affiliation,
        locked: false,
      });

    linkedRangeResult =
      validateSpecialCandidate(
        candidate,
        {
          ignoreBuildingId,
        }
      );
  }

  return {
    ...result,
    rangeBlockedCells:
      rules.blockedCells,
    linkedRangeCells:
      linkedRangeResult.cells,
    linkedRangeReason:
      linkedRangeResult.reason,
    canPlace:
      result.canPlace &&
      rules.allowed &&
      linkedRangeResult.allowed,
  };
}

export function addBuilding(data) {
  ensureWritable();
  const building = data instanceof Building ? data : new Building(data);
  if (!document.buildingTypes.some(type => type.id === building.typeId)) {
    throw new RangeError(`Unknown building type ID: ${building.typeId}`);
  }
  if (
    !canPlaceBuilding({
      ...building,
      typeId:
        building.typeId,
      affiliation:
        building.affiliation,
    }).canPlace
  ) {
    throw new RangeError(
      "Building cannot be placed."
    );
  }

  occupancy.addBuilding(
    building
  );
  document.buildings.push(
    building
  );

  try {
    upsertLinkedRange(
      building
    );
    recomputeLinkedRangeActivity();
  } catch (error) {
    occupancy.removeBuilding(
      building.id
    );
    document.buildings =
      document.buildings.filter(
        item =>
          item.id !==
            building.id
      );
    throw error;
  }

  return new Building(
    building
  );
}

export function moveBuilding(
  buildingId,
  newX,
  newY
) {
  ensureWritable();
  requireUserBuilding(
    buildingId
  );

  const current =
    occupancy.requireBuilding(
      buildingId
    );

  const rules =
    canPlaceBuilding({
      x: newX,
      y: newY,
      width: current.width,
      height: current.height,
      typeId: current.typeId,
      affiliation:
        current.affiliation,
      ignoreBuildingId:
        buildingId,
    });

  if (!rules.canPlace) {
    throw new RangeError(
      "Building cannot be moved."
    );
  }

  const originalX =
    current.x;
  const originalY =
    current.y;

  const moved =
    occupancy.moveBuilding(
      buildingId,
      newX,
      newY
    );

  try {
    upsertLinkedRange(
      moved
    );
    recomputeLinkedRangeActivity();
  } catch (error) {
    occupancy.moveBuilding(
      buildingId,
      originalX,
      originalY
    );
    throw error;
  }

  return new Building(
    moved
  );
}

export function deleteBuilding(buildingId) {
  ensureWritable();
  const building = requireUserBuilding(buildingId);
  if (building.locked) throw new RangeError("Locked buildings cannot be deleted.");
  const removed =
    occupancy.removeBuilding(
      buildingId
    );

  document.buildings =
    document.buildings.filter(
      item =>
        item.id !==
          buildingId
    );

  removeLinkedRange(
    buildingId
  );
  recomputeLinkedRangeActivity();

  return new Building(
    removed
  );
}

export function deleteBuildings(buildingIds) {
  ensureWritable();
  const ids = new Set(buildingIds);
  const targets = document.buildings.filter(item => ids.has(item.id));
  if (targets.some(item => item.locked)) throw new RangeError("Locked buildings cannot be deleted.");
  if (targets.length !== ids.size) throw new RangeError("Unknown building ID.");
  document.buildings =
    document.buildings.filter(
      item =>
        !ids.has(item.id)
    );

  document.ranges =
    document.ranges.filter(
      item =>
        !(
          item.linked &&
          ids.has(
            item.sourceBuildingId
          )
        )
    );

  rebuildOccupancy();
  recomputeLinkedRangeActivity();
  return targets.map(
    item =>
      new Building(item)
  );
}

export function restoreBuildings(states) {
  ensureWritable();
  const additions = states.map(item => item instanceof Building ? new Building(item) : new Building(item));
  const next = [...document.buildings, ...additions];
  const nextOccupancy = new OccupancyManager([...document.fixedBuildings, ...next]);
  document.buildings = next;
  occupancy = nextOccupancy;

  for (
    const addition
    of additions
  ) {
    upsertLinkedRange(
      addition
    );
  }

  recomputeLinkedRangeActivity();

  return additions.map(
    item =>
      new Building(item)
  );
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
  const check =
    canPlaceBuilding({
      x: candidate.x,
      y: candidate.y,
      width: candidate.width,
      height: candidate.height,
      typeId:
        candidate.typeId,
      affiliation:
        candidate.affiliation,
      ignoreBuildingId:
        current.id,
    });
  if (!check.canPlace) throw new RangeError("Building cannot be resized at its current position.");
  occupancy.removeBuilding(current.id);
  try { occupancy.addBuilding(candidate); }
  catch (error) { occupancy.addBuilding(current); throw error; }
  const index = document.buildings.findIndex(item => item.id === buildingId);
  document.buildings[index] =
    candidate;

  try {
    upsertLinkedRange(
      candidate
    );
    recomputeLinkedRangeActivity();
  } catch (error) {
    occupancy.removeBuilding(
      candidate.id
    );
    occupancy.addBuilding(
      current
    );
    document.buildings[index] =
      current;
    throw error;
  }

  return new Building(
    candidate
  );
}

export function restoreBuildingState(data) {
  ensureWritable();
  const candidate = data instanceof Building ? new Building(data) : new Building(data);
  if (!document.buildingTypes.some(type => type.id === candidate.typeId)) {
    throw new RangeError(`Unknown building type ID: ${candidate.typeId}`);
  }
  const current = requireUserBuilding(candidate.id);
  const check =
    canPlaceBuilding({
      x: candidate.x,
      y: candidate.y,
      width: candidate.width,
      height: candidate.height,
      typeId:
        candidate.typeId,
      affiliation:
        candidate.affiliation,
      ignoreBuildingId:
        current.id,
    });
  if (!check.canPlace) throw new RangeError("Building state cannot be restored.");
  occupancy.removeBuilding(current.id);
  try { occupancy.addBuilding(candidate); }
  catch (error) { occupancy.addBuilding(current); throw error; }
  document.buildings[
    document.buildings.findIndex(
      item =>
        item.id ===
          candidate.id
    )
  ] = candidate;

  upsertLinkedRange(
    candidate
  );
  recomputeLinkedRangeActivity();

  return new Building(
    candidate
  );
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
      presetId:
        candidate.presetId,
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
  const current =
    document.ranges[index];

  if (current.linked) {
    throw new RangeError(
      "Building-linked ranges cannot be edited directly."
    );
  }

  if (
    current.presetId ===
      "mountain"
  ) {
    return new MapRange(
      current
    );
  }

  const edited = new MapRange({
    id: current.id,
    kind: current.kind,
    color: current.color,
    locked: Boolean(locked),
    cells: current.cells,
    presetId:
      current.presetId,
  });
  document.ranges[index] = edited;
  return new MapRange(edited);
}

export function deleteRange(rangeId) {
  ensureWritable();
  const index = document.ranges.findIndex(item => item.id === rangeId);
  if (index < 0) throw new RangeError(`Unknown range ID: ${rangeId}`);
  const current =
    document.ranges[index];

  if (current.linked) {
    throw new RangeError(
      "Building-linked ranges cannot be deleted directly."
    );
  }

  if (
    current.locked &&
    current.presetId !==
      "mountain"
  ) {
    throw new RangeError(
      "Locked ranges cannot be deleted."
    );
  }
  document.ranges.splice(index, 1);
  return new MapRange(current);
}

export function setLinkedRangeAffiliationColor(
  affiliation,
  color
) {
  ensureWritable();

  const normalized =
    String(
      affiliation ??
      ""
    ).trim();

  const changed = [];

  document.ranges =
    document.ranges.map(
      item => {
        if (
          !item.linked ||
          item.affiliation !==
            normalized
        ) {
          return item;
        }

        const edited =
          new MapRange({
            ...item,
            color,
            linked: true,
            sourceBuildingId:
              item.sourceBuildingId,
            affiliation:
              item.affiliation,
          });

        changed.push(
          edited
        );

        return edited;
      }
    );

  return changed.map(
    item =>
      new MapRange(item)
  );
}

export function restoreRanges(ranges) {
  ensureWritable();
  const restored =
    ranges.map(
      item =>
        new MapRange(item)
    );

  document.ranges =
    restored;

  recomputeLinkedRangeActivity();

  return document.ranges.map(
    item =>
      new MapRange(item)
  );
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
  setLinkedRangeAffiliationColor,
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
