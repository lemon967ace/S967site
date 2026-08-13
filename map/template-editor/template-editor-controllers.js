import { rectangleCells } from "../editor/editor-range.js";

function command(engine, history, mutate, description, changed) {
  const before = engine.snapshot(), result = mutate(), after = engine.snapshot();
  history.record({ description, undo() { engine.restore(before); changed(); }, redo() { engine.restore(after); changed(); } }); changed(); return result;
}

export function createTemplateBuildingController({ engine, history, onChange = () => {}, onDirty = () => {} }) {
  let mode = "select", selectedTypeId = null, selectedBuildingId = null, preview = null;
  const changed = () => { onDirty(!history.isAtSavedState()); onChange(api.getState()); };
  const mutate = (fn, description) => command(engine, history, fn, description, changed);
  const api = {
    selectPalette(typeId) { selectedTypeId = typeId; selectedBuildingId = null; mode = "place"; preview = null; changed(); },
    updatePreview(x, y) { if (mode !== "place" && mode !== "move") return null; const building = api.getSelectedBuilding(); const typeId = mode === "move" ? building?.typeId : selectedTypeId; if (!typeId) return null; const type = engine.getDocument().fixedBuildingTypes.find(item => item.id === typeId); const placement = engine.checkPlacement(typeId, x, y, mode === "move" ? selectedBuildingId : null); preview = { x, y, width: type.width, height: type.height, typeId, canPlace: placement.canPlace, blockedCells: placement.blockedCells }; changed(); return preview; },
    commitAt(x, y, { name } = {}) { const value = api.updatePreview(x, y); if (!value?.canPlace) return null; if (mode === "move") { const result = mutate(() => engine.moveBuilding(selectedBuildingId, x, y), "fixedBuildingMove"); mode = "select"; preview = null; return result; } const result = mutate(() => engine.addBuilding({ name, typeId: selectedTypeId, x, y }), "fixedBuildingCreate"); selectedBuildingId = result.id; mode = "select"; preview = null; return result; },
    selectBuilding(id) { selectedBuildingId = id; mode = "select"; preview = null; changed(); return api.getSelectedBuilding(); },
    startMove() { if (!api.getSelectedBuilding()) return false; mode = "move"; preview = null; changed(); return true; },
    editSelected(changes) { if (!api.getSelectedBuilding()) return null; return mutate(() => engine.editBuilding(selectedBuildingId, changes), "fixedBuildingEdit"); },
    deleteSelected() { if (!api.getSelectedBuilding()) return null; const id = selectedBuildingId, result = mutate(() => engine.deleteBuilding(id), "fixedBuildingDelete"); selectedBuildingId = null; return result; },
    cancelMode() { mode = "select"; preview = null; changed(); }, normalizeSelection() { if (!api.getSelectedBuilding()) selectedBuildingId = null; },
    getSelectedBuilding() { return engine.getDocument().fixedBuildings.find(item => item.id === selectedBuildingId) ?? null; },
    getState() { return { mode, selectedTypeId, selectedBuildingId, preview }; },
    mutate, undo() { const value = history.undo(); changed(); return value; }, redo() { const value = history.redo(); changed(); return value; },
  }; return api;
}

export function createTemplateRangeController({ engine, history, onChange = () => {}, onDirty = () => {} }) {
  let mode = "select", settings = null, startCell = null, previewCells = [], selectedRangeId = null;
  const changed = () => { onDirty(!history.isAtSavedState()); onChange(api.getState()); };
  const mutate = (fn, description) => command(engine, history, fn, description, changed);
  const api = {
    startCreate(value) { mode = "rangeCreate"; settings = { kind: value.kind, color: value.color }; startCell = null; previewCells = []; selectedRangeId = null; changed(); },
    hover(cell) { if (mode === "rangeCreate" && startCell) { previewCells = rectangleCells(startCell, cell); changed(); } return previewCells; },
    click(cell) { if (mode !== "rangeCreate") return api.selectAtCell(cell); if (!startCell) { startCell = [...cell]; previewCells = [[...cell]]; changed(); return { complete: false }; } previewCells = rectangleCells(startCell, cell); changed(); return { complete: true, cells: previewCells }; },
    commit() { if (!previewCells.length || !settings) return null; const result = mutate(() => engine.addRange({ ...settings, cells: previewCells }), "fixedRangeCreate"); selectedRangeId = result.id; mode = "select"; startCell = null; previewCells = []; return result; },
    selectAtCell(cell) { selectedRangeId = [...engine.getDocument().fixedRanges].reverse().find(item => item.cells.some(value => value[0] === cell[0] && value[1] === cell[1]))?.id ?? null; changed(); return api.getSelectedRange(); },
    editSelected(changes) { return api.getSelectedRange() ? mutate(() => engine.editRange(selectedRangeId, changes), "fixedRangeEdit") : null; },
    deleteSelected() { if (!api.getSelectedRange()) return null; const id = selectedRangeId; mutate(() => engine.deleteRange(id), "fixedRangeDelete"); selectedRangeId = null; return true; },
    erase(cells) { return mutate(() => engine.eraseRangeCells(cells), "fixedRangeErase"); },
    cancel() { mode = "select"; startCell = null; previewCells = []; changed(); }, normalizeSelection() { if (!api.getSelectedRange()) selectedRangeId = null; },
    getSelectedRange() { return engine.getDocument().fixedRanges.find(item => item.id === selectedRangeId) ?? null; }, getState() { return { mode, settings, startCell, previewCells, selectedRangeId }; },
  }; return api;
}
