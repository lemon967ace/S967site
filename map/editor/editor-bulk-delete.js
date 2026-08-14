import { snapshotBuilding, snapshotRange } from "./editor-history.js";
import { rectangleCells } from "./editor-range.js";

export function areaBuildingTargets(buildings, cells) {
  const keys = new Set(cells.map(cell => cell.join(",")));
  const targets = buildings.filter(building => building.occupiedCells().some(cell => keys.has(cell.join(","))));
  return {
    targets,
    deletable: targets.filter(building => !building.locked),
    locked: targets.filter(building => building.locked),
  };
}

export function createBulkDeleteController({ engine, history, buildingController, rangeController, onChange = () => {}, onDirty = () => {} }) {
  let mode = "select", firstCell = null, previewCells = [], targetIds = new Set();
  let areaPeer = null;
  const state = () => ({ mode, firstCell: firstCell && [...firstCell], previewCells: previewCells.map(cell => [...cell]), targetIds: new Set(targetIds) });
  const emit = () => onChange(state());
  const ensureWritable = () => { if (engine.isReadOnly()) throw new Error("The map is read-only."); };
  function refreshTargets() { const result = areaBuildingTargets(engine.getDocument().buildings, previewCells); targetIds = new Set(result.deletable.map(item => item.id)); return result; }
  function start() { ensureWritable(); areaPeer?.cancel(); buildingController?.cancelMode(); rangeController?.cancel(); mode = "bulkDelete"; firstCell = null; previewCells = []; targetIds.clear(); emit(); }
  function begin(cell) { if (mode !== "bulkDelete") return null; firstCell = [...cell]; previewCells = [[...cell]]; refreshTargets(); emit(); return state(); }
  function update(cell) { if (mode !== "bulkDelete" || !firstCell) return null; previewCells = rectangleCells(firstCell, cell); const result = refreshTargets(); emit(); return result; }
  function summary() { return refreshTargets(); }
  function commit() {
    ensureWritable(); if (mode !== "bulkDelete") return null;
    const result = summary();
    if (!result.deletable.length) { cancel(); return { deleted: [], lockedCount: result.locked.length }; }
    const states =
      result.deletable.map(
        snapshotBuilding
      );
    const ids =
      states.map(
        item => item.id
      );
    const beforeRanges =
      engine.getDocument().ranges.map(
        snapshotRange
      );

    const deleted =
      engine.deleteBuildings(
        ids
      );

    const afterRanges =
      engine.getDocument().ranges.map(
        snapshotRange
      );

    history.record({
      description:
        "bulkDelete",
      undo() {
        engine.restoreBuildings(
          states
        );
        engine.restoreRanges(
          beforeRanges
        );
        buildingController
          ?.normalizeSelection();
      },
      redo() {
        engine.deleteBuildings(
          ids
        );
        engine.restoreRanges(
          afterRanges
        );
        buildingController
          ?.normalizeSelection();
      },
    });
    buildingController?.normalizeSelection(); onDirty(!history.isAtSavedState()); cancel();
    return { deleted, lockedCount: result.locked.length };
  }
  function cancel() { mode = "select"; firstCell = null; previewCells = []; targetIds.clear(); emit(); }
  return { start, begin, update, summary, commit, cancel, getState: state, setAreaPeer(value) { areaPeer = value; } };
}
