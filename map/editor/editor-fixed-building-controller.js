import { FixedBuilding } from "./editor-model.js";
import { sameBuildingState, snapshotBuilding } from "./editor-history.js";

export const FIXED_EDITOR_MODES = Object.freeze({
  SELECT: "select",
  PLACE: "place",
  MOVE: "move",
});

export function createFixedBuildingController({
  engine,
  history = null,
  onChange = () => {},
  onDirty = () => {},
} = {}) {
  let mode = FIXED_EDITOR_MODES.SELECT;
  let palette = null;
  let selectedBuildingId = null;
  let preview = null;
  let rangePeer = null;
  const areaPeers = new Set();

  function snapshot() {
    return {
      mode,
      palette: palette && { ...palette },
      selectedBuildingId,
      preview: preview && {
        ...preview,
        cells: preview.cells.map(cell => [...cell]),
      },
    };
  }

  function emit() {
    onChange(snapshot());
  }

  function ensureEditable() {
    if (engine.isReadOnly()) throw new Error("The template is read-only.");
  }

  function cancelMode() {
    mode = FIXED_EDITOR_MODES.SELECT;
    palette = null;
    preview = null;
    emit();
  }

  function selectBuilding(id) {
    selectedBuildingId = id ?? null;
    emit();
  }

  function normalizeSelection() {
    if (selectedBuildingId && !selected()) selectedBuildingId = null;
    return selectedBuildingId;
  }

  function selectPalette(typeId, defaults = {}) {
    ensureEditable();
    for (const peer of areaPeers) peer?.cancel();
    rangePeer?.cancel();

    const type = engine.getDocument().fixedBuildingTypes.find(item => item.id === typeId);
    if (!type) throw new RangeError("Unknown fixed building type ID.");

    palette = {
      typeId,
      color: defaults.color ?? type.color,
      priority: Number.isInteger(defaults.priority) ? defaults.priority : 0,
    };
    selectedBuildingId = null;
    mode = FIXED_EDITOR_MODES.PLACE;
    preview = null;
    emit();
  }

  function startMove() {
    ensureEditable();
    const building = selected();
    if (!building) throw new RangeError("Select a fixed building first.");
    for (const peer of areaPeers) peer?.cancel();
    rangePeer?.cancel();
    mode = FIXED_EDITOR_MODES.MOVE;
    palette = null;
    preview = null;
    emit();
  }

  function updatePreview(x, y) {
    if (mode === FIXED_EDITOR_MODES.SELECT) {
      preview = null;
      return null;
    }

    const building = mode === FIXED_EDITOR_MODES.MOVE ? selected() : null;
    const typeId = building?.typeId ?? palette?.typeId;
    const type = engine.getDocument().fixedBuildingTypes.find(item => item.id === typeId);
    if (!type) {
      preview = null;
      return null;
    }

    const result = engine.canPlaceFixedBuilding({
      x,
      y,
      width: type.width,
      height: type.height,
      ignoreBuildingId: building?.id ?? null,
    });

    preview = {
      x,
      y,
      width: type.width,
      height: type.height,
      typeId,
      color: building?.color ?? palette?.color ?? type.color,
      priority: building?.priority ?? palette?.priority ?? 0,
      valid: result.canPlace,
      canPlace: result.canPlace,
      cells: result.occupiedCells,
      blockedCells: result.blockedCells,
    };

    emit();
    return preview;
  }

  function commitAt(x, y, { name } = {}) {
    ensureEditable();
    updatePreview(x, y);
    if (!preview?.valid) return null;

    if (mode === FIXED_EDITOR_MODES.PLACE) {
      const building = engine.addFixedBuilding(new FixedBuilding({
        name,
        typeId: palette.typeId,
        x,
        y,
        width: preview.width,
        height: preview.height,
        color: palette.color,
        priority: palette.priority,
      }));

      const state = snapshotBuilding(building);
      history?.record({
        description: "fixedCreate",
        undo() {
          engine.deleteFixedBuilding(state.id);
          selectedBuildingId = null;
        },
        redo() {
          engine.restoreFixedBuildings([state]);
          selectedBuildingId = state.id;
        },
      });

      selectedBuildingId = building.id;
      mode = FIXED_EDITOR_MODES.SELECT;
      preview = null;
      notifyMutation();
      emit();
      return building;
    }

    if (mode === FIXED_EDITOR_MODES.MOVE) {
      const before = snapshotBuilding(selected());
      if (before.x === x && before.y === y) {
        mode = FIXED_EDITOR_MODES.SELECT;
        preview = null;
        emit();
        return selected();
      }

      const building = engine.moveFixedBuilding(selectedBuildingId, x, y);
      const after = snapshotBuilding(building);
      history?.record({
        description: "fixedMove",
        undo() {
          engine.restoreFixedBuildingState(before);
          selectedBuildingId = before.id;
        },
        redo() {
          engine.restoreFixedBuildingState(after);
          selectedBuildingId = after.id;
        },
      });

      mode = FIXED_EDITOR_MODES.SELECT;
      preview = null;
      notifyMutation();
      emit();
      return building;
    }

    return null;
  }

  function deleteSelected() {
    ensureEditable();
    if (!selectedBuildingId) return null;
    const before = snapshotBuilding(selected());
    const removed = engine.deleteFixedBuilding(selectedBuildingId);

    history?.record({
      description: "fixedDelete",
      undo() {
        engine.restoreFixedBuildings([before]);
        selectedBuildingId = before.id;
      },
      redo() {
        engine.deleteFixedBuilding(before.id);
        selectedBuildingId = null;
      },
    });

    selectedBuildingId = null;
    mode = FIXED_EDITOR_MODES.SELECT;
    preview = null;
    notifyMutation();
    emit();
    return removed;
  }

  function editSelected(changes) {
    ensureEditable();
    if (!selectedBuildingId) throw new RangeError("Select a fixed building first.");
    const before = snapshotBuilding(selected());
    const edited = engine.editFixedBuilding(selectedBuildingId, changes);
    const after = snapshotBuilding(edited);

    if (sameBuildingState(before, after)) {
      emit();
      return edited;
    }

    history?.record({
      description: "fixedEdit",
      undo() {
        engine.restoreFixedBuildingState(before);
        selectedBuildingId = before.id;
      },
      redo() {
        engine.restoreFixedBuildingState(after);
        selectedBuildingId = after.id;
      },
    });

    notifyMutation();
    emit();
    return edited;
  }

  function notifyMutation() {
    onDirty(history ? !history.isAtSavedState() : true);
  }

  function undo() {
    ensureEditable();
    const command = history?.undo();
    if (!command) return null;
    mode = FIXED_EDITOR_MODES.SELECT;
    preview = null;
    normalizeSelection();
    notifyMutation();
    emit();
    return command;
  }

  function redo() {
    ensureEditable();
    const command = history?.redo();
    if (!command) return null;
    mode = FIXED_EDITOR_MODES.SELECT;
    preview = null;
    normalizeSelection();
    notifyMutation();
    emit();
    return command;
  }

  function selected() {
    return engine.getDocument().fixedBuildings.find(item => item.id === selectedBuildingId) ?? null;
  }

  return {
    getState: snapshot,
    selectBuilding,
    normalizeSelection,
    selectPalette,
    startMove,
    updatePreview,
    commitAt,
    cancelMode,
    deleteSelected,
    editSelected,
    undo,
    redo,
    getSelectedBuilding: selected,
    setRangeController(value) {
      rangePeer = value;
    },
    addAreaPeer(value) {
      areaPeers.add(value);
    },
  };
}
