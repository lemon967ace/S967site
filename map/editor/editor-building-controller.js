import { Building } from "./editor-model.js";

export const EDITOR_MODES = Object.freeze({ SELECT: "select", PLACE: "place", MOVE: "move" });

export function createBuildingController({ engine, onChange = () => {}, onDirty = () => {} }) {
  let mode = EDITOR_MODES.SELECT, palette = null, selectedBuildingId = null, preview = null;

  function snapshot() { return { mode, palette: palette && { ...palette }, selectedBuildingId, preview: preview && { ...preview, cells: preview.cells.map(cell => [...cell]) } }; }
  function emit() { onChange(snapshot()); }
  function ensureEditable() { if (engine.isReadOnly()) throw new Error("The map is read-only."); }
  function cancelMode() { mode = EDITOR_MODES.SELECT; palette = null; preview = null; emit(); }
  function selectBuilding(id) { selectedBuildingId = id ?? null; emit(); }
  function selectPalette(typeId, size = 1, defaultAffiliation = "") {
    ensureEditable();
    if (!engine.getDocument().buildingTypes.some(type => type.id === typeId)) throw new RangeError("Unknown building type ID.");
    if (![1, 2].includes(size)) throw new RangeError("Building size must be 1 or 2.");
    palette = { typeId, size, defaultAffiliation }; mode = EDITOR_MODES.PLACE; preview = null; emit();
  }
  function startMove() {
    ensureEditable(); const building = selected();
    if (!building) throw new RangeError("Select a building first.");
    if (building.locked) throw new RangeError("Locked buildings cannot be moved.");
    mode = EDITOR_MODES.MOVE; palette = null; preview = null; emit();
  }
  function updatePreview(x, y) {
    if (mode === EDITOR_MODES.SELECT) { preview = null; return null; }
    const building = mode === EDITOR_MODES.MOVE ? selected() : null;
    const width = building?.width ?? palette.size, height = building?.height ?? palette.size;
    const result = engine.canPlaceBuilding({ x, y, width, height, ignoreBuildingId: building?.id ?? null });
    preview = { x, y, width, height, typeId: building?.typeId ?? palette.typeId, valid: result.canPlace, cells: result.occupiedCells };
    emit(); return preview;
  }
  function commitAt(x, y, { name, affiliation } = {}) {
    ensureEditable(); updatePreview(x, y);
    if (!preview?.valid) return null;
    if (mode === EDITOR_MODES.PLACE) {
      const building = engine.addBuilding(new Building({ name, typeId: palette.typeId, x, y, width: palette.size, height: palette.size, affiliation: affiliation ?? palette.defaultAffiliation, locked: false }));
      selectedBuildingId = building.id; preview = null; onDirty(); emit(); return building;
    }
    if (mode === EDITOR_MODES.MOVE) {
      const building = engine.moveBuilding(selectedBuildingId, x, y);
      mode = EDITOR_MODES.SELECT; preview = null; onDirty(); emit(); return building;
    }
    return null;
  }
  function deleteSelected() {
    ensureEditable(); if (!selectedBuildingId) return null;
    const removed = engine.deleteBuilding(selectedBuildingId); selectedBuildingId = null; mode = EDITOR_MODES.SELECT; preview = null; onDirty(); emit(); return removed;
  }
  function editSelected(changes) {
    ensureEditable(); if (!selectedBuildingId) throw new RangeError("Select a building first.");
    const edited = engine.editBuilding(selectedBuildingId, changes); onDirty(); emit(); return edited;
  }
  function selected() { return engine.getDocument().buildings.find(item => item.id === selectedBuildingId) ?? null; }
  return { getState: snapshot, selectBuilding, selectPalette, startMove, updatePreview, commitAt, cancelMode, deleteSelected, editSelected, getSelectedBuilding: selected };
}
