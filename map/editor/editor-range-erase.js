import { snapshotRange } from "./editor-history.js";
import { rectangleCells } from "./editor-range.js";

export function subtractRangeCells(ranges, cells) {
  const selected = new Set(cells.map(cell => cell.join(",")));
  let removedCount = 0, lockedCount = 0;
  const rangesAfter = [];
  for (const range of ranges) {
    const intersects = range.cells.some(cell => selected.has(cell.join(",")));
    if (range.locked) { if (intersects) lockedCount++; rangesAfter.push(snapshotRange(range)); continue; }
    const remaining = range.cells.filter(cell => !selected.has(cell.join(",")));
    removedCount += range.cells.length - remaining.length;
    if (remaining.length) rangesAfter.push({ ...snapshotRange(range), cells: remaining.map(cell => [...cell]) });
  }
  return { ranges: rangesAfter, removedCount, lockedCount };
}

export function createRangeEraseController({ engine, history, buildingController, rangeController, bulkDeleteController, onChange = () => {}, onDirty = () => {} }) {
  let mode = "select", firstCell = null, previewCells = [];
  const state = () => ({ mode, firstCell: firstCell && [...firstCell], previewCells: previewCells.map(cell => [...cell]) });
  const emit = () => onChange(state());
  const ensureWritable = () => { if (engine.isReadOnly()) throw new Error("The map is read-only."); };
  function start() { ensureWritable(); bulkDeleteController?.cancel(); buildingController?.cancelMode(); rangeController?.cancel(); mode = "rangeErase"; firstCell = null; previewCells = []; emit(); }
  function begin(cell) { if (mode !== "rangeErase") return null; firstCell = [...cell]; previewCells = [[...cell]]; emit(); return state(); }
  function update(cell) { if (mode !== "rangeErase" || !firstCell) return null; previewCells = rectangleCells(firstCell, cell); emit(); return state(); }
  function summary() { return subtractRangeCells(engine.getDocument().ranges, previewCells); }
  function commit() {
    ensureWritable(); if (mode !== "rangeErase") return null;
    const before = engine.getDocument().ranges.map(snapshotRange), result = subtractRangeCells(before, previewCells);
    if (!result.removedCount) { cancel(); return result; }
    const after = result.ranges.map(snapshotRange); engine.restoreRanges(after); rangeController?.normalizeSelection();
    history.record({ description: "rangePartialDelete", undo() { engine.restoreRanges(before); rangeController?.normalizeSelection(); }, redo() { engine.restoreRanges(after); rangeController?.normalizeSelection(); } });
    onDirty(!history.isAtSavedState()); cancel(); return result;
  }
  function cancel() { mode = "select"; firstCell = null; previewCells = []; emit(); }
  return { start, begin, update, summary, commit, cancel, getState: state };
}
