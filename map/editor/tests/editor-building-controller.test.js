import test from "node:test";
import assert from "node:assert/strict";
import * as engine from "../editor-engine.js";
import { createBuildingController } from "../editor-building-controller.js";

function setup(options = {}) {
  engine.createNewDocument(options); let dirty = 0, changes = 0;
  const controller = createBuildingController({ engine, onDirty: () => dirty++, onChange: () => changes++ });
  return { controller, dirty: () => dirty, changes: () => changes };
}

test("palette selection enters placement mode without dirtying", () => {
  const subject = setup(); subject.controller.selectPalette("type-02", 2);
  assert.equal(subject.controller.getState().mode, "place"); assert.equal(subject.controller.getState().palette.size, 2); assert.equal(subject.dirty(), 0);
});

test("valid, collision, and boundary placement previews reuse occupancy", () => {
  const { controller } = setup(); controller.selectPalette("type-01", 2);
  assert.equal(controller.updatePreview(20, 20).valid, true);
  assert.equal(controller.updatePreview(0, 0).valid, false);
  controller.cancelMode(); controller.selectPalette("type-01", 1); controller.commitAt(20, 20, { name: "A" });
  assert.equal(controller.updatePreview(20, 20).valid, false);
});

test("1x1 and 2x2 creation update occupancy, selection, and dirty", () => {
  const subject = setup(); const { controller } = subject;
  controller.selectPalette("type-01", 1); const one = controller.commitAt(14, 14, { name: "One" });
  assert.equal(engine.getOccupancy().buildingIdAt(14, 14), one.id); assert.equal(controller.getState().selectedBuildingId, one.id);
  controller.selectPalette("type-02", 2, "A-1"); const two = controller.commitAt(20, 20, { name: "Two" });
  assert.equal(two.affiliation, "A-1"); assert.equal(engine.getOccupancy().buildingIdAt(19, 19), two.id); assert.equal(subject.dirty(), 2);
});

test("move validation, cancel, and commit preserve atomic occupancy", () => {
  const subject = setup(), c = subject.controller;
  c.selectPalette("type-01", 1); const moving = c.commitAt(20, 20, { name: "Move" });
  c.selectPalette("type-01", 1); c.commitAt(24, 24, { name: "Block" }); c.selectBuilding(moving.id); c.startMove();
  assert.equal(c.updatePreview(24, 24).valid, false); assert.equal(c.commitAt(24, 24), null); assert.equal(engine.getOccupancy().buildingIdAt(20, 20), moving.id);
  c.cancelMode(); assert.equal(engine.getOccupancy().buildingIdAt(20, 20), moving.id);
  c.startMove(); c.commitAt(30, 30); assert.equal(engine.getOccupancy().buildingIdAt(20, 20), null); assert.equal(engine.getOccupancy().buildingIdAt(30, 30), moving.id); assert.equal(c.getState().selectedBuildingId, moving.id);
});

test("delete frees occupancy while locked deletion is rejected", () => {
  const { controller: c } = setup(); c.selectPalette("type-01", 1); const a = c.commitAt(20, 20, { name: "A" });
  c.deleteSelected(); assert.equal(engine.getOccupancy().buildingIdAt(20, 20), null);
  c.selectPalette("type-01", 1); const locked = c.commitAt(22, 22, { name: "L" }); c.editSelected({ locked: true });
  assert.throws(() => c.deleteSelected(), /Locked/); assert.equal(engine.getOccupancy().buildingIdAt(22, 22), locked.id);
});

test("edits name, affiliation, type, size and refreshes document data", () => {
  const { controller: c } = setup(); c.selectPalette("type-01", 1); const a = c.commitAt(20, 20, { name: "Old" });
  const edited = c.editSelected({ name: "New", affiliation: "#07", typeId: "type-02", width: 2, height: 2 });
  assert.equal(edited.name, "New"); assert.equal(engine.getDocument().buildings[0].name, "New"); assert.equal(engine.getDocument().buildings[0].typeId, "type-02"); assert.equal(engine.getOccupancy().buildingIdAt(19, 19), a.id);
  assert.throws(() => c.editSelected({ affiliation: "AB" }), /three printable ASCII/);
});

test("preview, selection and cancel never dirty; mutations do", () => {
  const subject = setup(), c = subject.controller; c.selectPalette("type-01", 1); c.updatePreview(20, 20); c.cancelMode(); c.selectBuilding(null); assert.equal(subject.dirty(), 0);
  c.selectPalette("type-01", 1); c.commitAt(20, 20, { name: "A" }); c.startMove(); c.commitAt(22, 22); c.editSelected({ name: "B" }); c.deleteSelected(); assert.equal(subject.dirty(), 4);
});

test("read-only rejects palette and every engine mutation", () => {
  engine.createNewDocument(); const data = engine.exportDocument(); engine.loadDocument(data, { readOnly: true });
  const c = createBuildingController({ engine });
  assert.throws(() => c.selectPalette("type-01", 1), /read-only/);
  assert.throws(() => engine.addBuilding({ name: "A", typeId: "type-01", x: 20, y: 20, width: 1, height: 1 }), /read-only/);
  assert.throws(() => engine.editBuilding("missing", { name: "B" }), /read-only/);
  assert.throws(() => engine.deleteBuilding("missing"), /read-only/);
});
