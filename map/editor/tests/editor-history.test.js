import test from "node:test";
import assert from "node:assert/strict";
import * as engine from "../editor-engine.js";
import { createBuildingController } from "../editor-building-controller.js";
import { createHistory, editorShortcutAction, MAX_HISTORY_STEPS } from "../editor-history.js";

function setup({ saved = true, readOnly = false } = {}) {
  engine.createNewDocument();
  if (readOnly) engine.loadDocument(engine.exportDocument(), { readOnly: true });
  let dirty = !saved, changes = 0;
  const history = createHistory({ readOnly: () => engine.isReadOnly(), onChange: () => changes++ });
  history.clear({ saved });
  const controller = createBuildingController({ engine, history, onDirty: value => dirty = value });
  return { history, controller, dirty: () => dirty, changes: () => changes };
}
function create(c, name = "A", x = 20, y = 20, size = 1) { c.selectPalette("type-01", size); return c.commitAt(x, y, { name }); }

test("Python history limit is 200 and oldest entries are discarded", () => {
  assert.equal(MAX_HISTORY_STEPS, 200); const h = createHistory({ limit: 3 });
  for (let i = 0; i < 5; i++) h.record({ undo() {}, redo() {} });
  assert.equal(h.getState().undoCount, 3);
});

test("create undo removes occupancy and redo restores the same ID and selection", () => {
  const s = setup(), building = create(s.controller);
  s.controller.undo(); assert.equal(engine.getDocument().buildings.length, 0); assert.equal(engine.getOccupancy().buildingIdAt(20, 20), null); assert.equal(s.controller.getState().selectedBuildingId, null);
  s.controller.redo(); assert.equal(engine.getDocument().buildings[0].id, building.id); assert.equal(engine.getOccupancy().buildingIdAt(20, 20), building.id); assert.equal(s.controller.getState().selectedBuildingId, building.id);
});

test("delete undo restores every field and redo deletes again", () => {
  const s = setup(), building = create(s.controller); s.controller.editSelected({ affiliation: "A-1" }); s.controller.deleteSelected();
  s.controller.undo(); const restored = engine.getDocument().buildings[0]; assert.deepEqual([restored.id, restored.name, restored.typeId, restored.x, restored.y, restored.width, restored.height, restored.affiliation, restored.locked], [building.id, "A", "type-01", 20, 20, 1, 1, "A-1", false]); assert.equal(s.controller.getState().selectedBuildingId, building.id);
  s.controller.redo(); assert.equal(engine.getDocument().buildings.length, 0); assert.equal(s.controller.getState().selectedBuildingId, null);
});

test("move undo and redo synchronize all 2x2 occupancy cells", () => {
  const s = setup(), building = create(s.controller, "Large", 20, 20, 2); s.controller.startMove(); s.controller.commitAt(30, 30);
  s.controller.undo(); assert.equal(engine.getOccupancy().buildingIdAt(19, 19), building.id); assert.equal(engine.getOccupancy().buildingIdAt(29, 29), null);
  s.controller.redo(); assert.equal(engine.getOccupancy().buildingIdAt(19, 19), null); assert.equal(engine.getOccupancy().buildingIdAt(29, 29), building.id); assert.equal(s.controller.getState().selectedBuildingId, building.id);
});

test("one multi-field edit is one command with atomic undo and redo", () => {
  const s = setup(), building = create(s.controller); const beforeCount = s.history.getState().undoCount;
  s.controller.editSelected({ name: "Edited", typeId: "type-02", width: 2, height: 2, affiliation: "#07", locked: true });
  assert.equal(s.history.getState().undoCount, beforeCount + 1);
  s.controller.undo(); let restored = engine.getDocument().buildings[0]; assert.deepEqual([restored.name, restored.typeId, restored.width, restored.affiliation, restored.locked], ["A", "type-01", 1, "", false]);
  s.controller.redo(); restored = engine.getDocument().buildings[0]; assert.deepEqual([restored.name, restored.typeId, restored.width, restored.affiliation, restored.locked], ["Edited", "type-02", 2, "#07", true]); assert.equal(engine.getOccupancy().buildingIdAt(19, 19), building.id);
});

test("edit and move no-ops do not enter history", () => {
  const s = setup(), building = create(s.controller), count = s.history.getState().undoCount;
  s.controller.editSelected({ name: building.name }); assert.equal(s.history.getState().undoCount, count);
  s.controller.startMove(); s.controller.commitAt(building.x, building.y); assert.equal(s.history.getState().undoCount, count);
});

test("new mutation after undo clears redo and replay never records history", () => {
  const s = setup(); create(s.controller, "A", 20, 20); create(s.controller, "B", 22, 22); const count = s.history.getState().undoCount;
  s.controller.undo(); assert.equal(s.history.canRedo(), true); assert.equal(s.history.getState().undoCount, count - 1);
  create(s.controller, "C", 24, 24); assert.equal(s.history.canRedo(), false); assert.equal(s.history.getState().undoCount, count);
  s.controller.undo(); s.controller.redo(); assert.equal(s.history.getState().undoCount, count);
});

test("save point makes undo-to-saved clean and redo-away dirty", () => {
  const s = setup(); create(s.controller); s.history.markSaved(); s.controller.editSelected({ name: "B" }); assert.equal(s.dirty(), true);
  s.controller.undo(); assert.equal(s.dirty(), false); s.controller.redo(); assert.equal(s.dirty(), true);
});

test("clear resets history for new or loaded documents", () => {
  const s = setup(); create(s.controller); s.history.clear({ saved: true }); assert.equal(s.history.canUndo(), false); assert.equal(s.history.canRedo(), false); assert.equal(s.history.isAtSavedState(), true);
  s.history.clear({ saved: false }); assert.equal(s.history.isAtSavedState(), false);
});

test("Ctrl+Z and Ctrl+Y resolve while form focus is protected", () => {
  assert.equal(editorShortcutAction({ key: "z", ctrlKey: true }), "undo"); assert.equal(editorShortcutAction({ key: "y", ctrlKey: true }), "redo");
  assert.equal(editorShortcutAction({ key: "z", ctrlKey: true, isFormControl: true }), null); assert.equal(editorShortcutAction({ key: "z" }), null);
});

test("read-only history cannot record, undo, or redo", () => {
  const s = setup({ readOnly: true }); assert.equal(s.history.record({ undo() {}, redo() {} }), false); assert.equal(s.history.undo(), null); assert.equal(s.history.redo(), null);
});
