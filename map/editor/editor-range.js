import { buildRangeCellOwnerIndex, isValidMapCell, MapRange } from "./editor-model.js";
import { snapshotRange } from "./editor-history.js";

export const RANGE_COLORS = ["#4E79A7", "#F28E2B", "#E15759", "#76B7B2", "#59A14F", "#EDC948", "#B07AA1", "#FF9DA7", "#9C755F", "#BAB0AC", "#1F77B4", "#FF7F0E", "#2CA02C", "#D62728", "#9467BD", "#8C564B", "#E377C2", "#7F7F7F"];

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
  let mode = "select", settings = null, startCell = null, previewCells = [], selectedRangeId = null;
  const areaPeers = new Set();
  const emit = () => onChange(api.getState());
  const notify = () => onDirty(!history.isAtSavedState());
  function ensureWritable() { if (engine.isReadOnly()) throw new Error("The map is read-only."); }
  function startCreate(next) { ensureWritable(); for (const peer of areaPeers) peer?.cancel(); buildingController?.cancelMode(); settings = { kind: next.kind, color: next.color, locked: Boolean(next.locked) }; new MapRange({ ...settings, cells: [[0, 0]] }); mode = "rangeCreate"; startCell = null; previewCells = []; selectedRangeId = null; emit(); }
  function hover(cell) { if (mode !== "rangeCreate" || !startCell) return null; previewCells = rectangleCells(startCell, cell); emit(); return previewCells; }
  function click(cell) { if (mode !== "rangeCreate") { selectAtCell(cell); return { complete: false }; } if (!startCell) { startCell = [...cell]; previewCells = [[...cell]]; emit(); return { complete: false }; } previewCells = rectangleCells(startCell, cell); emit(); return { complete: true, cells: previewCells.map(value => [...value]) }; }
  function commit() {
    ensureWritable(); if (mode !== "rangeCreate" || !startCell || !previewCells.length) return null;
    const before = engine.getDocument().ranges.map(snapshotRange), result = engine.commitRange({ ...settings, cells: previewCells }), after = engine.getDocument().ranges.map(snapshotRange);
    if (!result.accepted.length) return null;
    selectedRangeId = after.at(-1)?.id ?? null; mode = "select"; startCell = null; previewCells = [];
    history.record({ description: "rangeCreate", undo() { engine.restoreRanges(before); selectedRangeId = null; }, redo() { engine.restoreRanges(after); selectedRangeId = after.at(-1)?.id ?? null; } }); notify(); emit(); return result;
  }
  function selectAtCell(cell) { const ranges = engine.getDocument().ranges; selectedRangeId = [...ranges].reverse().find(item => item.cells.some(value => value[0] === cell[0] && value[1] === cell[1]))?.id ?? null; emit(); return selected(); }
  function editSelected({ locked }) { ensureWritable(); const item = selected(); if (!item) return null; if (item.locked === Boolean(locked)) return item; const before = engine.getDocument().ranges.map(snapshotRange); const edited = engine.editRange(item.id, { locked }); const after = engine.getDocument().ranges.map(snapshotRange); history.record({ description: "rangeEdit", undo() { engine.restoreRanges(before); selectedRangeId = item.id; }, redo() { engine.restoreRanges(after); selectedRangeId = item.id; } }); notify(); emit(); return edited; }
  function deleteSelected() { ensureWritable(); const item = selected(); if (!item) return null; const before = engine.getDocument().ranges.map(snapshotRange); const deleted = engine.deleteRange(item.id); const after = engine.getDocument().ranges.map(snapshotRange); history.record({ description: "rangeDelete", undo() { engine.restoreRanges(before); selectedRangeId = item.id; }, redo() { engine.restoreRanges(after); selectedRangeId = null; } }); selectedRangeId = null; notify(); emit(); return deleted; }
  function cancel() { mode = "select"; settings = null; startCell = null; previewCells = []; emit(); }
  function selected() { return engine.getDocument().ranges.find(item => item.id === selectedRangeId) ?? null; }
  function normalizeSelection() { if (selectedRangeId && !selected()) selectedRangeId = null; return selectedRangeId; }
  function undo() { const command = history.undo(); if (!command) return null; mode = "select"; previewCells = []; notify(); emit(); return command; }
  function redo() { const command = history.redo(); if (!command) return null; mode = "select"; previewCells = []; notify(); emit(); return command; }
  const api = { startCreate, hover, click, commit, selectAtCell, editSelected, deleteSelected, cancel, undo, redo, normalizeSelection, addAreaPeer(value) { areaPeers.add(value); }, getSelectedRange: selected, getState: () => ({ mode, settings: settings && { ...settings }, startCell: startCell && [...startCell], previewCells: previewCells.map(cell => [...cell]), selectedRangeId }) };
  return api;
}
