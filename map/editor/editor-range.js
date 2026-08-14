import { buildRangeCellOwnerIndex, isValidMapCell, MapRange } from "./editor-model.js";
import { calculateOccupiedCells } from "./editor-occupancy.js";

function snapshotRange(range) {
  return Object.freeze({
    id: range.id,
    kind: range.kind,
    color: range.color,
    locked: range.locked,
    priority: range.priority,
    fixed: range.fixed,
    linked: Boolean(range.linked),
    sourceBuildingId:
      range.sourceBuildingId ??
      null,
    affiliation:
      range.affiliation ??
      "",
    active:
      range.active !== false,
    cells: Object.freeze(
      range.cells.map(
        cell =>
          Object.freeze([...cell])
      )
    ),
  });
}

export const RANGE_COLORS = ["#4E79A7", "#F28E2B", "#E15759", "#76B7B2", "#59A14F", "#EDC948", "#B07AA1", "#FF9DA7", "#9C755F", "#BAB0AC", "#1F77B4", "#FF7F0E", "#2CA02C", "#D62728", "#9467BD", "#8C564B", "#E377C2", "#7F7F7F"];

export const MOUNTAIN_PRESET = Object.freeze({
  id: "mountain",
  kind: "blocked",
  color: "#7F7F7F",
  locked: false,
  width: 2,
  height: 2,
});

export function rectangleCells(first, second) {
  if (!isValidMapCell(...first) || !isValidMapCell(...second)) return [];
  const [u1, v1] = [(first[0] + first[1]) / 2, (first[1] - first[0]) / 2];
  const [u2, v2] = [(second[0] + second[1]) / 2, (second[1] - second[0]) / 2];
  const cells = [];
  for (let u = Math.min(u1, u2); u <= Math.max(u1, u2); u++) for (let v = Math.min(v1, v2); v <= Math.max(v1, v2); v++) {
    const cell = [u - v, u + v]; if (isValidMapCell(...cell)) cells.push(cell);
  }
  return cells;
}

export class RangeOverlapError extends RangeError {
  constructor() { super("A range cannot overlap another range."); this.code = "RANGE_OVERLAP"; }
}

export function applyRangeOverlapRules(existingRanges, { kind, color, locked, cells }, fixedRanges = []) {
  const candidate = new MapRange({ kind, color, locked, cells });
  const owners = buildRangeCellOwnerIndex({ fixedRanges, ranges: existingRanges });
  if (candidate.cells.some(cell => owners.has(cell.join(",")))) throw new RangeOverlapError();
  return { ranges: [...existingRanges.map(snapshotRange), snapshotRange(candidate)], accepted: candidate.cells.map(cell => [...cell]) };
}

export function visibleRangeCells(range, bounds) {
  return range.cells.filter(([x, y]) => x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY);
}

export function createRangeController({ engine, history, buildingController = null, onChange = () => {}, onDirty = () => {} }) {
  let mode = "select", settings = null, preset = null, startCell = null, previewCells = [], selectedRangeId = null;
  const areaPeers = new Set();
  const emit = () => onChange(api.getState());
  const notify = () => onDirty(!history.isAtSavedState());
  function ensureWritable() { if (engine.isReadOnly()) throw new Error("The map is read-only."); }
  function startCreate(next) {
    ensureWritable();
    for (const peer of areaPeers) peer?.cancel();
    buildingController?.cancelMode();

    settings = {
      kind: next.kind,
      color: next.color,
      locked: Boolean(next.locked),
    };
    preset = null;

    new MapRange({
      ...settings,
      cells: [[0, 0]],
    });

    mode = "rangeCreate";
    startCell = null;
    previewCells = [];
    selectedRangeId = null;
    emit();
  }

  function startPreset(next = MOUNTAIN_PRESET) {
    ensureWritable();
    for (const peer of areaPeers) peer?.cancel();
    buildingController?.cancelMode();

    preset = {
      ...MOUNTAIN_PRESET,
      ...next,
    };
    settings = null;
    mode = "rangePreset";
    startCell = null;
    previewCells = [];
    selectedRangeId = null;
    emit();
  }

  function placePresetAt(cell) {
    ensureWritable();

    if (
      mode !== "rangePreset" ||
      !preset
    ) {
      return null;
    }

    const cells =
      calculateOccupiedCells(
        cell[0],
        cell[1],
        preset.width,
        preset.height
      );

    if (
      cells.some(
        value =>
          !isValidMapCell(
            ...value
          )
      )
    ) {
      throw new RangeError(
        "The preset would extend outside the map."
      );
    }

    /*
      A mountain is an obstacle, so do not allow dropping one on top of
      an existing building. Range/range overlap is still validated by
      engine.commitRange().
    */
    const document =
      engine.getDocument();

    const occupied =
      new Set(
        [
          ...document.fixedBuildings,
          ...document.buildings,
        ]
          .flatMap(
            building =>
              building
                .occupiedCells()
                .map(
                  value =>
                    value.join(",")
                )
          )
      );

    if (
      cells.some(
        value =>
          occupied.has(
            value.join(",")
          )
      )
    ) {
      const error =
        new RangeError(
          "The preset cannot overlap a building."
        );
      error.code =
        "RANGE_PRESET_BUILDING_OVERLAP";
      throw error;
    }

    const before =
      document.ranges.map(
        snapshotRange
      );

    const result =
      engine.commitRange({
        kind: preset.kind,
        color: preset.color,
        locked: Boolean(
          preset.locked
        ),
        cells,
      });

    const after =
      engine
        .getDocument()
        .ranges
        .map(
          snapshotRange
        );

    if (!result.accepted.length) {
      return null;
    }

    selectedRangeId =
      after.at(-1)?.id ??
      null;

    /*
      Building palette behavior: one placement ends the preset mode.
      The user presses Mountain again to place another obstacle.
    */
    mode = "select";
    preset = null;
    previewCells = [];

    history.record({
      description:
        "rangePresetMountain",
      undo() {
        engine.restoreRanges(
          before
        );
        selectedRangeId = null;
      },
      redo() {
        engine.restoreRanges(
          after
        );
        selectedRangeId =
          after.at(-1)?.id ??
          null;
      },
    });

    notify();
    emit();

    return {
      complete: true,
      cells:
        result.accepted.map(
          value => [...value]
        ),
      result,
    };
  }
  function hover(cell) { if (mode !== "rangeCreate" || !startCell) return null; previewCells = rectangleCells(startCell, cell); emit(); return previewCells; }
  function click(cell) {
    if (mode !== "rangeCreate") {
      selectAtCell(cell);
      return { complete: false };
    }

    /*
      첫 번째 클릭: 시작점만 저장.
      Renderer는 첫 실제 클릭의 pointerdown에서 시작점을 지정하고,
      pointerup에서는 같은 셀을 다시 전달한다. 같은 셀은 아래에서 무시한다.
      두 번째 실제 클릭의 pointerup에서 다른 셀이 들어오면 즉시 확정한다.
    */
    if (!startCell) {
      startCell = [...cell];
      previewCells = [[...cell]];
      emit();
      return { complete: false };
    }

    const sameAsStart =
      cell[0] === startCell[0] &&
      cell[1] === startCell[1] &&
      previewCells.length <= 1;

    if (sameAsStart) {
      emit();
      return { complete: false };
    }

    /*
      두 번째 클릭: 시작점부터 두 번째 점까지의 직사각형을 만든 뒤
      별도의 '확정' 버튼 없이 즉시 범위를 생성한다.
      고정맵 제작기의 범위 생성 동작과 동일한 방식이다.
    */
    previewCells =
      rectangleCells(
        startCell,
        cell
      );

    emit();

    const cells =
      previewCells.map(
        value => [...value]
      );

    const result =
      commit();

    return {
      complete:
        Boolean(result),
      cells,
      result,
    };
  }
  function commit() {
    ensureWritable(); if (mode !== "rangeCreate" || !startCell || !previewCells.length) return null;
    const before = engine.getDocument().ranges.map(snapshotRange), result = engine.commitRange({ ...settings, cells: previewCells }), after = engine.getDocument().ranges.map(snapshotRange);
    if (!result.accepted.length) return null;
    selectedRangeId = after.at(-1)?.id ?? null; mode = "select"; startCell = null; previewCells = [];
    history.record({ description: "rangeCreate", undo() { engine.restoreRanges(before); selectedRangeId = null; }, redo() { engine.restoreRanges(after); selectedRangeId = after.at(-1)?.id ?? null; } }); notify(); emit(); return result;
  }
  function selectAtCell(cell) {
    const ranges =
      engine.getDocument().ranges;

    /*
      Linked alliance ranges are system-controlled and may overlap each other,
      so normal range selection intentionally ignores them.
    */
    selectedRangeId =
      [...ranges]
        .reverse()
        .find(
          item =>
            !item.linked &&
            item.cells.some(
              value =>
                value[0] ===
                  cell[0] &&
                value[1] ===
                  cell[1]
            )
        )?.id ??
      null;

    emit();
    return selected();
  }
  function editSelected({ locked }) {
    ensureWritable();
    const item = selected();
    if (!item) return null;
    if (item.linked) {
      throw new RangeError(
        "Building-linked ranges cannot be edited directly."
      );
    }
    if (
      item.locked ===
      Boolean(locked)
    ) {
      return item;
    }
    const before =
      engine.getDocument().ranges.map(
        snapshotRange
      );
    const edited =
      engine.editRange(
        item.id,
        { locked }
      );
    const after =
      engine.getDocument().ranges.map(
        snapshotRange
      );
    history.record({
      description: "rangeEdit",
      undo() {
        engine.restoreRanges(before);
        selectedRangeId = item.id;
      },
      redo() {
        engine.restoreRanges(after);
        selectedRangeId = item.id;
      },
    });
    notify();
    emit();
    return edited;
  }

  function setAffiliationColor(
    affiliation,
    color
  ) {
    ensureWritable();

    const before =
      engine.getDocument().ranges.map(
        snapshotRange
      );

    const changed =
      engine.setLinkedRangeAffiliationColor(
        affiliation,
        color
      );

    if (!changed.length) {
      return [];
    }

    const after =
      engine.getDocument().ranges.map(
        snapshotRange
      );

    history.record({
      description:
        "linkedRangeColor",
      undo() {
        engine.restoreRanges(before);
      },
      redo() {
        engine.restoreRanges(after);
      },
    });

    notify();
    emit();
    return changed;
  }
  function deleteSelected() { ensureWritable(); const item = selected(); if (!item) return null; const before = engine.getDocument().ranges.map(snapshotRange); const deleted = engine.deleteRange(item.id); const after = engine.getDocument().ranges.map(snapshotRange); history.record({ description: "rangeDelete", undo() { engine.restoreRanges(before); selectedRangeId = item.id; }, redo() { engine.restoreRanges(after); selectedRangeId = null; } }); selectedRangeId = null; notify(); emit(); return deleted; }
  function cancel() {
    mode = "select";
    settings = null;
    preset = null;
    startCell = null;
    previewCells = [];
    emit();
  }
  function selected() { return engine.getDocument().ranges.find(item => item.id === selectedRangeId) ?? null; }
  function normalizeSelection() { if (selectedRangeId && !selected()) selectedRangeId = null; return selectedRangeId; }
  function undo() { const command = history.undo(); if (!command) return null; mode = "select"; previewCells = []; notify(); emit(); return command; }
  function redo() { const command = history.redo(); if (!command) return null; mode = "select"; previewCells = []; notify(); emit(); return command; }
  const api = {
    startCreate,
    startPreset,
    placePresetAt,
    hover,
    click,
    commit,
    selectAtCell,
    editSelected,
    deleteSelected,
    setAffiliationColor,
    cancel,
    undo,
    redo,
    normalizeSelection,
    addAreaPeer(value) {
      areaPeers.add(value);
    },
    getSelectedRange:
      selected,
    getState: () => ({
      mode,
      settings:
        settings && {
          ...settings,
        },
      preset:
        preset && {
          ...preset,
        },
      startCell:
        startCell &&
        [...startCell],
      previewCells:
        previewCells.map(
          cell => [...cell]
        ),
      selectedRangeId,
    }),
  };
  return api;
}
