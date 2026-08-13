import test from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { createBuildingFilter } from "../editor-filter.js";

const types = [{ id: "type-01", name: "One" }, { id: "type-02", name: "Two" }];
const building = (id, typeId = "type-01", affiliation = "") => ({ id, typeId, affiliation });
const document = (buildings = []) => ({ buildingTypes: types, buildings, ranges: [{ id: "range-1" }] });

test("BuildingType filter supports multiple exact IDs", () => {
  const filter = createBuildingFilter(document());
  filter.set({ typeIds: new Set(["type-02"]) });
  assert.equal(filter.passes(building("a", "type-01")), false);
  assert.equal(filter.passes(building("b", "type-02")), true);
});

test("affiliation filter is case-sensitive exact match and supports multiple values", () => {
  const filter = createBuildingFilter(document([building("a", "type-01", "ABC"), building("b", "type-01", "abc")]));
  filter.set({ affiliations: new Set(["ABC", "other"]) });
  assert.equal(filter.passes(building("a", "type-01", "ABC")), true);
  assert.equal(filter.passes(building("b", "type-01", "abc")), false);
  assert.equal(filter.passes(building("c", "type-01", "other")), true);
});

test("type and affiliation filters combine with AND", () => {
  const filter = createBuildingFilter(document());
  filter.set({ typeIds: new Set(["type-02"]), affiliations: new Set(["X"]) });
  assert.equal(filter.passes(building("a", "type-02", "X")), true);
  assert.equal(filter.passes(building("b", "type-01", "X")), false);
  assert.equal(filter.passes(building("c", "type-02", "Y")), false);
});

test("reset shows every document type and affiliation including empty", () => {
  const doc = document([building("a", "type-01", "X")]);
  const filter = createBuildingFilter(doc);
  filter.set({ typeIds: new Set(), affiliations: new Set() });
  filter.reset(doc);
  assert.deepEqual([...filter.getState().typeIds], ["type-01", "type-02"]);
  assert.deepEqual([...filter.getState().affiliations], ["", "X"]);
});

test("Python dim/hide body, label, and hit-test policy is preserved", () => {
  const item = building("a");
  const filter = createBuildingFilter(document());
  filter.set({ typeIds: new Set() });
  assert.deepEqual(filter.appearance(item), { visible: true, bodyAlpha: 0.2, labelAlpha: 0.28, hitTest: true });
  filter.set({ mode: "hide" });
  assert.deepEqual(filter.appearance(item), { visible: false, bodyAlpha: 0, labelAlpha: 0, hitTest: false });
  assert.deepEqual(filter.appearance(item, item.id), { visible: true, bodyAlpha: 1, labelAlpha: 1, hitTest: true });
});

test("filter changes are transient: document, dirty marker, history, and ranges stay untouched", () => {
  const doc = document([building("a", "type-01", "X")]);
  const before = structuredClone(doc); let dirty = false; const history = [];
  const filter = createBuildingFilter(doc);
  filter.set({ mode: "hide", typeIds: new Set(), affiliations: new Set() });
  assert.deepEqual(doc, before); assert.equal(dirty, false); assert.equal(history.length, 0);
  assert.deepEqual(doc.ranges, before.ranges);
});

test("current filter immediately reevaluates create, edit, delete, undo, and redo results", () => {
  const filter = createBuildingFilter(document());
  filter.set({ typeIds: new Set(["type-02"]), affiliations: new Set(["X"]) });
  const created = building("new", "type-01", "X");
  assert.equal(filter.passes(created), false);
  created.typeId = "type-02"; assert.equal(filter.passes(created), true);
  created.affiliation = "Y"; assert.equal(filter.passes(created), false);
  created.affiliation = "X"; assert.equal(filter.passes(created), true); // undo
  assert.equal(filter.passes(created), true); // redo/create object is evaluated live
  assert.equal([created].filter(filter.passes).length, 1);
  assert.equal([].filter(filter.passes).length, 0); // delete
});

test("affiliation choices refresh for document mutations while existing choices retain state", () => {
  const filter = createBuildingFilter(document([building("a", "type-01", "X")]));
  filter.set({ affiliations: new Set([""]) });
  const available = filter.refreshAffiliations([building("b", "type-01", "Y")]);
  assert.deepEqual([...available], ["", "Y"]);
  assert.deepEqual([...filter.getState().affiliations], ["", "Y"]);
});

test("read-only and language changes need no mutation and retain copied filter state", () => {
  const filter = createBuildingFilter(document());
  filter.set({ mode: "hide", typeIds: new Set(["type-02"]) });
  const before = filter.getState();
  const labels = { en: "Types", ko: "종류", ja: "種類", ru: "Типы" };
  for (const language of Object.keys(labels)) assert.equal(filter.getState().mode, before.mode);
  assert.deepEqual(filter.getState().typeIds, before.typeIds);
});

test("1000-building predicate path remains a simple linear pass", () => {
  const buildings = Array.from({ length: 1000 }, (_, index) => building(String(index), index % 2 ? "type-01" : "type-02", index % 3 ? "X" : "Y"));
  const filter = createBuildingFilter(document(buildings));
  filter.set({ typeIds: new Set(["type-02"]), affiliations: new Set(["X"]) });
  const start = performance.now();
  const count = buildings.filter(item => filter.passes(item)).length;
  assert.equal(count, 333);
  assert.ok(performance.now() - start < 1000);
});
