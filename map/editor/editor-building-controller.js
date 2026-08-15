import { Building } from "./editor-model.js";
import { sameBuildingState, snapshotBuilding, snapshotRange } from "./editor-history.js";

export const EDITOR_MODES = Object.freeze({ SELECT: "select", PLACE: "place", MOVE: "move" });

function snapshotFixedBuilding(building) {
  return Object.freeze({
    id: building.id,
    name: building.name,
    typeId: building.typeId,
    type_id: building.typeId,
    x: building.x,
    y: building.y,
    width: building.width,
    height: building.height,
    color: building.color,
    priority: building.priority ?? 0,
    locked: Boolean(building.locked),
    fixed: true,
  });
}

function sameFixedBuildingState(a, b) {
  return a.id === b.id &&
    a.name === b.name &&
    a.typeId === b.typeId &&
    a.x === b.x &&
    a.y === b.y &&
    a.width === b.width &&
    a.height === b.height &&
    a.color === b.color &&
    a.priority === b.priority &&
    a.locked === b.locked;
}

export function createBuildingController({ engine, history = null, onChange = () => {}, onDirty = () => {} }) {
  let mode = EDITOR_MODES.SELECT, palette = null, selectedBuildingId = null, preview = null;
  let rangePeer = null;
  const areaPeers = new Set();

  function snapshot() {
    return {
      mode,
      palette: palette && { ...palette },
      selectedBuildingId,
      preview: preview && { ...preview, cells: preview.cells.map(cell => [...cell]) },
    };
  }
  function emit() { onChange(snapshot()); }
  function ensureEditable() { if (engine.isReadOnly()) throw new Error("The map is read-only."); }
  function cancelMode() { mode = EDITOR_MODES.SELECT; palette = null; preview = null; emit(); }
  function selectBuilding(id) { selectedBuildingId = id ?? null; emit(); }
  function normalizeSelection() { if (selectedBuildingId && !selected()) selectedBuildingId = null; return selectedBuildingId; }

  function selectPalette(typeId, size = 1, defaultAffiliation = "") {
    ensureEditable();
    for (const peer of areaPeers) peer?.cancel();
    rangePeer?.cancel();
    if (!engine.getDocument().buildingTypes.some(type => type.id === typeId)) throw new RangeError("Unknown building type ID.");
    if (![1, 2].includes(size)) throw new RangeError("Building size must be 1 or 2.");
    palette = { typeId, size, defaultAffiliation };
    mode = EDITOR_MODES.PLACE;
    preview = null;
    emit();
  }

  function setPlacementAffiliation(affiliation) {
    if (mode !== EDITOR_MODES.PLACE || !palette) return;
    palette.defaultAffiliation = affiliation;
    preview = null;
    emit();
  }

  function startMove() {
    ensureEditable();
    const building = selected();
    if (!building) throw new RangeError("Select a building first.");
    if (building.fixed && engine.getDocumentMode?.() !== "template") {
      throw new RangeError("Template buildings cannot be moved in a map.");
    }
    if (!building.fixed && building.locked) {
      throw new RangeError("Locked buildings cannot be moved.");
    }
    for (const peer of areaPeers) peer?.cancel();
    mode = EDITOR_MODES.MOVE;
    palette = null;
    preview = null;
    emit();
  }

  function updatePreview(x, y) {
    if (mode === EDITOR_MODES.SELECT) { preview = null; return null; }

    const building = mode === EDITOR_MODES.MOVE ? selected() : null;
    const width = building?.width ?? palette.size;
    const height = building?.height ?? palette.size;

    const result = building?.fixed
      ? engine.canPlaceFixedBuilding({
          x, y, width, height, ignoreBuildingId: building.id,
        })
      : engine.canPlaceBuilding({
          x, y, width, height,
          typeId: building?.typeId ?? palette.typeId,
          affiliation: building?.affiliation ?? palette.defaultAffiliation ?? "",
          ignoreBuildingId: building?.id ?? null,
        });

    preview = {
      x, y, width, height,
      typeId: building?.typeId ?? palette.typeId,
      color: building?.color,
      fixed: Boolean(building?.fixed),
      valid: result.canPlace,
      cells: result.occupiedCells,
      linkedRangeCells: result.linkedRangeCells ?? [],
      linkedRangeReason: result.linkedRangeReason ?? null,
    };
    emit();
    return preview;
  }

  function commitAt(x, y, { name, affiliation } = {}) {
    ensureEditable();
    updatePreview(x, y);
    if (!preview?.valid) return null;

    if (mode === EDITOR_MODES.PLACE) {
      const beforeRanges = engine.getDocument().ranges.map(snapshotRange);
      const building = engine.addBuilding(new Building({
        name,
        typeId: palette.typeId,
        x, y,
        width: palette.size,
        height: palette.size,
        affiliation: affiliation ?? palette.defaultAffiliation,
        locked: false,
      }));
      const state = snapshotBuilding(building);
      const afterRanges = engine.getDocument().ranges.map(snapshotRange);

      history?.record({
        description: "create",
        undo() { engine.deleteBuilding(state.id); engine.restoreRanges(beforeRanges); selectedBuildingId = null; },
        redo() { engine.addBuilding(state); engine.restoreRanges(afterRanges); selectedBuildingId = state.id; },
      });

      selectedBuildingId = building.id;
      mode = EDITOR_MODES.SELECT;
      palette = null;
      preview = null;
      notifyMutation();
      emit();
      return building;
    }

    if (mode === EDITOR_MODES.MOVE) {
      const current = selected();
      const fixed = Boolean(current?.fixed);
      const before = fixed ? snapshotFixedBuilding(current) : snapshotBuilding(current);
      const beforeRanges = engine.getDocument().ranges.map(snapshotRange);

      if (before.x === x && before.y === y) {
        mode = EDITOR_MODES.SELECT;
        preview = null;
        emit();
        return selected();
      }

      const building = fixed
        ? engine.moveFixedBuilding(selectedBuildingId, x, y)
        : engine.moveBuilding(selectedBuildingId, x, y);

      const after = fixed ? snapshotFixedBuilding(building) : snapshotBuilding(building);
      const afterRanges = engine.getDocument().ranges.map(snapshotRange);

      history?.record({
        description: "move",
        undo() {
          fixed ? engine.restoreFixedBuildingState(before) : engine.restoreBuildingState(before);
          if (!fixed) engine.restoreRanges(beforeRanges);
          selectedBuildingId = before.id;
        },
        redo() {
          fixed ? engine.restoreFixedBuildingState(after) : engine.restoreBuildingState(after);
          if (!fixed) engine.restoreRanges(afterRanges);
          selectedBuildingId = after.id;
        },
      });

      mode = EDITOR_MODES.SELECT;
      preview = null;
      notifyMutation();
      emit();
      return building;
    }

    return null;
  }

  function deleteSelected() {
    ensureEditable();
    const current = selected();
    if (!current) return null;

    const fixed = Boolean(current.fixed);
    if (fixed && engine.getDocumentMode?.() !== "template") {
      throw new RangeError("Template buildings cannot be deleted from a map.");
    }
    if (!fixed && current.locked) {
      throw new RangeError("Locked buildings cannot be deleted.");
    }
    const state = fixed ? snapshotFixedBuilding(current) : snapshotBuilding(current);
    const beforeRanges = engine.getDocument().ranges.map(snapshotRange);

    const removed = fixed
      ? engine.deleteFixedBuilding(selectedBuildingId)
      : engine.deleteBuilding(selectedBuildingId);

    const afterRanges = engine.getDocument().ranges.map(snapshotRange);

    history?.record({
      description: "delete",
      undo() {
        fixed ? engine.restoreFixedBuildings([state]) : engine.addBuilding(state);
        if (!fixed) engine.restoreRanges(beforeRanges);
        selectedBuildingId = state.id;
      },
      redo() {
        fixed ? engine.deleteFixedBuilding(state.id) : engine.deleteBuilding(state.id);
        if (!fixed) engine.restoreRanges(afterRanges);
        selectedBuildingId = null;
      },
    });

    selectedBuildingId = null;
    mode = EDITOR_MODES.SELECT;
    preview = null;
    notifyMutation();
    emit();
    return removed;
  }

  function editSelected(changes) {
    ensureEditable();
    const current = selected();
    if (!current) throw new RangeError("Select a building first.");

    const fixed = Boolean(current.fixed);
    if (fixed && engine.getDocumentMode?.() !== "template") {
      throw new RangeError("Template buildings cannot be edited in a map.");
    }
    /*
      Do not reject a locked user building merely because the UI submitted
      unchanged form fields. The engine compares actual values and blocks
      only real protected-field changes while still allowing unlock/no-op.
    */
    const before = fixed ? snapshotFixedBuilding(current) : snapshotBuilding(current);
    const beforeRanges = engine.getDocument().ranges.map(snapshotRange);

    const edited = fixed
      ? engine.editFixedBuilding(selectedBuildingId, changes)
      : engine.editBuilding(selectedBuildingId, changes);

    const after = fixed ? snapshotFixedBuilding(edited) : snapshotBuilding(edited);
    const afterRanges = engine.getDocument().ranges.map(snapshotRange);

    const unchanged = fixed ? sameFixedBuildingState(before, after) : sameBuildingState(before, after);
    if (unchanged) { emit(); return edited; }

    history?.record({
      description: "edit",
      undo() {
        fixed ? engine.restoreFixedBuildingState(before) : engine.restoreBuildingState(before);
        if (!fixed) engine.restoreRanges(beforeRanges);
        selectedBuildingId = before.id;
      },
      redo() {
        fixed ? engine.restoreFixedBuildingState(after) : engine.restoreBuildingState(after);
        if (!fixed) engine.restoreRanges(afterRanges);
        selectedBuildingId = after.id;
      },
    });

    notifyMutation();
    emit();
    return edited;
  }

  function notifyMutation() { onDirty(history ? !history.isAtSavedState() : true); }
  function undo() { ensureEditable(); const command = history?.undo(); if (!command) return null; mode = EDITOR_MODES.SELECT; preview = null; notifyMutation(); emit(); return command; }
  function redo() { ensureEditable(); const command = history?.redo(); if (!command) return null; mode = EDITOR_MODES.SELECT; preview = null; notifyMutation(); emit(); return command; }

  function selected() {
    const doc = engine.getDocument();
    return [...doc.fixedBuildings, ...doc.buildings].find(item => item.id === selectedBuildingId) ?? null;
  }

  return {
    getState: snapshot,
    selectBuilding,
    normalizeSelection,
    selectPalette,
    setPlacementAffiliation,
    startMove,
    updatePreview,
    commitAt,
    cancelMode,
    deleteSelected,
    editSelected,
    undo,
    redo,
    getSelectedBuilding: selected,
    setRangeController(value) { rangePeer = value; },
    addAreaPeer(value) { areaPeers.add(value); },
  };
}
