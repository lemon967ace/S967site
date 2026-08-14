export const MAX_HISTORY_STEPS = 200;

export function editorShortcutAction({ key, ctrlKey = false, metaKey = false, altKey = false, shiftKey = false, isFormControl = false }) {
  if (isFormControl || !(ctrlKey || metaKey) || altKey) return null;
  const normalized = String(key).toLowerCase();
  if (normalized === "z" && !shiftKey) return "undo";
  if (normalized === "y" && !shiftKey) return "redo";
  return null;
}

export function snapshotBuilding(building) {
  return Object.freeze({
    id: building.id,
    name: building.name,
    typeId: building.typeId,
    x: building.x,
    y: building.y,
    width: building.width,
    height: building.height,
    affiliation: building.affiliation,
    locked: building.locked,
    color: building.color,
    priority: building.priority,
    fixed: building.fixed,
  });
}

export function snapshotRange(range) {
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
    presetId:
      range.presetId ??
      null,
    cells: Object.freeze(range.cells.map(cell => Object.freeze([...cell]))),
  });
}

export function sameBuildingState(a, b) {
  return a.id === b.id && a.name === b.name && a.typeId === b.typeId && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height && a.affiliation === b.affiliation && a.locked === b.locked && a.color === b.color && a.priority === b.priority;
}

export function createHistory({ limit = MAX_HISTORY_STEPS, readOnly = () => false, onChange = () => {} } = {}) {
  if (!Number.isInteger(limit) || limit <= 0) throw new RangeError("History limit must be a positive integer.");
  let undoStack = [], redoStack = [], nextStateId = 1, currentStateId = 0, savedStateId = null, replaying = false;
  const emit = () => onChange(api.getState());
  function record(command) {
    if (readOnly() || replaying) return false;
    if (!command || typeof command.undo !== "function" || typeof command.redo !== "function") throw new TypeError("A history command requires undo and redo.");
    const entry = { command, beforeStateId: currentStateId, afterStateId: nextStateId++ };
    undoStack.push(entry); if (undoStack.length > limit) undoStack.shift();
    redoStack = []; currentStateId = entry.afterStateId; emit(); return true;
  }
  function replay(stack, destination, direction) {
    if (readOnly() || !stack.length) return null;
    const entry = stack[stack.length - 1]; replaying = true;
    try { entry.command[direction](); } finally { replaying = false; }
    stack.pop(); destination.push(entry); currentStateId = direction === "undo" ? entry.beforeStateId : entry.afterStateId; emit(); return entry.command;
  }
  function clear({ saved = false } = {}) { undoStack = []; redoStack = []; currentStateId = nextStateId++; savedStateId = saved ? currentStateId : null; emit(); }
  const api = {
    record, undo: () => replay(undoStack, redoStack, "undo"), redo: () => replay(redoStack, undoStack, "redo"), clear,
    markSaved(stateId = currentStateId) { savedStateId = stateId; emit(); },
    canUndo: () => !readOnly() && undoStack.length > 0,
    canRedo: () => !readOnly() && redoStack.length > 0,
    isAtSavedState: () => savedStateId !== null && currentStateId === savedStateId,
    isReplaying: () => replaying,
    getState: () => ({ undoCount: undoStack.length, redoCount: redoStack.length, canUndo: !readOnly() && undoStack.length > 0, canRedo: !readOnly() && redoStack.length > 0, isAtSavedState: savedStateId !== null && currentStateId === savedStateId, currentStateId, savedStateId }),
  };
  return api;
}
