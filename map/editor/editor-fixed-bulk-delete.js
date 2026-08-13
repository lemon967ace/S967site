import { snapshotBuilding } from "./editor-history.js";
import { rectangleCells } from "./editor-range.js";

export function fixedAreaBuildingTargets(buildings, cells) {
  const keys = new Set(cells.map(cell => cell.join(",")));
  const targets = buildings.filter(building =>
    building.occupiedCells().some(cell => keys.has(cell.join(",")))
  );
  return { targets, deletable: targets, locked: [] };
}

export function createFixedBulkDeleteController({
  engine,
  history,
  buildingController,
  rangeController,
  onChange = () => {},
  onDirty = () => {},
} = {}) {
  let mode = "select";
  let firstCell = null;
  let previewCells = [];
  let targetIds = new Set();
  let areaPeer = null;

  const state = () => ({
    mode,
    firstCell: firstCell && [...firstCell],
    previewCells: previewCells.map(cell => [...cell]),
    targetIds: new Set(targetIds),
  });
  const emit = () => onChange(state());

  function refreshTargets() {
    const result = fixedAreaBuildingTargets(engine.getDocument().fixedBuildings, previewCells);
    targetIds = new Set(result.deletable.map(item => item.id));
    return result;
  }

  function start() {
    areaPeer?.cancel();
    buildingController?.cancelMode();
    rangeController?.cancel();
    mode = "bulkDelete";
    firstCell = null;
    previewCells = [];
    targetIds.clear();
    emit();
  }

  function begin(cell) {
    if (mode !== "bulkDelete") return null;
    firstCell = [...cell];
    previewCells = [[...cell]];
    refreshTargets();
    emit();
    return state();
  }

  function update(cell) {
    if (mode !== "bulkDelete" || !firstCell) return null;
    previewCells = rectangleCells(firstCell, cell);
    const result = refreshTargets();
    emit();
    return result;
  }

  function summary() {
    return refreshTargets();
  }

  function commit() {
    if (mode !== "bulkDelete") return null;
    const result = summary();
    if (!result.deletable.length) {
      cancel();
      return { deleted: [], lockedCount: 0 };
    }

    const states = result.deletable.map(snapshotBuilding);
    const ids = states.map(item => item.id);
    const deleted = engine.deleteFixedBuildings(ids);

    history.record({
      description: "fixedBulkDelete",
      undo() {
        engine.restoreFixedBuildings(states);
        buildingController?.normalizeSelection();
      },
      redo() {
        engine.deleteFixedBuildings(ids);
        buildingController?.normalizeSelection();
      },
    });

    buildingController?.normalizeSelection();
    onDirty(!history.isAtSavedState());
    cancel();
    return { deleted, lockedCount: 0 };
  }

  function cancel() {
    mode = "select";
    firstCell = null;
    previewCells = [];
    targetIds.clear();
    emit();
  }

  return {
    start,
    begin,
    update,
    summary,
    commit,
    cancel,
    getState: state,
    setAreaPeer(value) {
      areaPeer = value;
    },
  };
}
