import { snapshotRange } from "./editor-history.js";
import { rectangleCells } from "./editor-range.js";

export function subtractFixedRangeCells(ranges, cells) {
  const selected = new Set(cells.map(cell => cell.join(",")));
  let removedCount = 0;
  const rangesAfter = [];

  for (const range of ranges) {
    const remaining = range.cells.filter(cell => !selected.has(cell.join(",")));
    removedCount += range.cells.length - remaining.length;
    if (remaining.length) {
      rangesAfter.push({
        ...snapshotRange(range),
        cells: remaining.map(cell => [...cell]),
      });
    }
  }

  return { ranges: rangesAfter, removedCount, lockedCount: 0 };
}

export function createFixedRangeEraseController({
  engine,
  history,
  buildingController,
  rangeController,
  bulkDeleteController,
  onChange = () => {},
  onDirty = () => {},
} = {}) {
  let mode = "select";
  let firstCell = null;
  let previewCells = [];

  const state = () => ({
    mode,
    firstCell: firstCell && [...firstCell],
    previewCells: previewCells.map(cell => [...cell]),
  });
  const emit = () => onChange(state());

  function start() {
    bulkDeleteController?.cancel();
    buildingController?.cancelMode();
    rangeController?.cancel();
    mode = "rangeErase";
    firstCell = null;
    previewCells = [];
    emit();
  }

  function begin(cell) {
    if (mode !== "rangeErase") return null;
    firstCell = [...cell];
    previewCells = [[...cell]];
    emit();
    return state();
  }

  function update(cell) {
    if (mode !== "rangeErase" || !firstCell) return null;
    previewCells = rectangleCells(firstCell, cell);
    emit();
    return state();
  }

  function summary() {
    return subtractFixedRangeCells(engine.getDocument().fixedRanges, previewCells);
  }

  function commit() {
    if (mode !== "rangeErase") return null;
    const before = engine.getDocument().fixedRanges.map(snapshotRange);
    const result = subtractFixedRangeCells(before, previewCells);
    if (!result.removedCount) {
      cancel();
      return result;
    }

    const after = result.ranges.map(snapshotRange);
    engine.restoreFixedRanges(after);
    rangeController?.normalizeSelection();

    history.record({
      description: "fixedRangePartialDelete",
      undo() {
        engine.restoreFixedRanges(before);
        rangeController?.normalizeSelection();
      },
      redo() {
        engine.restoreFixedRanges(after);
        rangeController?.normalizeSelection();
      },
    });

    onDirty(!history.isAtSavedState());
    cancel();
    return result;
  }

  function cancel() {
    mode = "select";
    firstCell = null;
    previewCells = [];
    emit();
  }

  return { start, begin, update, summary, commit, cancel, getState: state };
}
