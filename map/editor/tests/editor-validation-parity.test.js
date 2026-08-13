import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Building, BuildingType, MapDocument, MapRange } from "../editor-model.js";
import { parseDocument, serializeDocument, DocumentError } from "../editor-document.js";
import * as engine from "../editor-engine.js";

const makeTypes = () => Array.from({ length: 7 }, (_, i) => new BuildingType({
  id: `type-${String(i + 1).padStart(2, "0")}`,
  name: `종류 ${i + 1}`,
  color: "#123456",
}));

const baseData = () => serializeDocument(new MapDocument({
  title: "검사 지도",
  buildingTypes: makeTypes(),
  view: { centerX: 0, centerY: 0, zoom: 1 },
}));

const building = overrides => new Building({
  id: "building-01", name: "건물", typeId: "type-01",
  x: 10, y: 10, width: 1, height: 1, ...overrides,
});

test("new document preserves the Python BuildingType data policy", () => {
  const document = engine.createNewDocument();
  assert.deepEqual(document.buildingTypes.map(item => item.name), [
    "건물 종류 1", "건물 종류 2", "건물 종류 3", "건물 종류 4",
    "건물 종류 5", "건물 종류 6", "건물 종류 7",
  ]);
});

test("affiliation accepts empty or exactly three printable ASCII characters", () => {
  assert.equal(building({ affiliation: "" }).affiliation, "");
  assert.equal(building({ affiliation: " A-1 " }).affiliation, "A-1");
  for (const affiliation of ["AB", "ABCD", "가나다", "A\nB", 123]) {
    assert.throws(() => building({ affiliation }));
  }
});

test("only 1x1 and 2x2 sizes are accepted", () => {
  assert.doesNotThrow(() => building({ width: 1, height: 1 }));
  assert.doesNotThrow(() => building({ x: 10, y: 12, width: 2, height: 2 }));
  for (const [width, height] of [[1, 2], [2, 1], [3, 3]]) {
    assert.throws(() => building({ width, height }));
  }
});

test("2x2 buildings enforce all Python map boundaries", () => {
  assert.doesNotThrow(() => building({ x: 1, y: 3, width: 2, height: 2 }));
  assert.doesNotThrow(() => building({ x: 510, y: 1022, width: 2, height: 2 }));
  for (const [x, y] of [[0, 100], [511, 101], [100, 0], [101, 1]]) {
    assert.throws(() => building({ x, y, width: 2, height: 2 }));
  }
});

test("MapDocument rejects duplicate IDs, unknown type references, and blank title", () => {
  const type = new BuildingType({ id: "type-01", name: "종류", color: "#123456" });
  assert.throws(() => new MapDocument({ title: "지도", buildingTypes: [type, new BuildingType({ id: "type-01", name: "중복", color: "#654321" })] }));
  assert.throws(() => new MapDocument({ title: "지도", buildingTypes: [type], buildings: [building({ id: "same", x: 10, y: 10 }), building({ id: "same", x: 20, y: 20 })] }));
  assert.throws(() => new MapDocument({ title: "지도", buildingTypes: [type], buildings: [building({ typeId: "missing" })] }));
  assert.throws(() => new MapDocument({ title: "   " }));
});

test("MapRange validates kind, non-empty cells, normalization, and cross-range overlap", () => {
  assert.throws(() => new MapRange({ id: "r", kind: "other", color: "#fff", cells: [[0, 0]] }));
  assert.throws(() => new MapRange({ id: "r", kind: "allowed", color: "#fff", cells: [] }));
  const normalized = new MapRange({ id: "r", kind: "allowed", color: "#fff", cells: [[0, 0], [0, 0], [2, 2]] });
  assert.deepEqual(normalized.cells, [[0, 0], [2, 2]]);
  assert.throws(() => new MapDocument({ title: "지도", ranges: [
    normalized,
    new MapRange({ id: "r2", kind: "blocked", color: "#000", cells: [[2, 2]] }),
  ] }));
});

test("parser validates dimensions independent of object key order", () => {
  const reordered = baseData();
  reordered.map = { max_y: 1023, min_y: 0, max_x: 511, min_x: 0 };
  assert.doesNotThrow(() => parseDocument(reordered));
  for (const map of [
    { min_x: 0, max_x: 512, min_y: 0, max_y: 1023 },
    { min_x: 0, max_x: 511, min_y: 0 },
    { min_x: 0, max_x: 511, min_y: 0, max_y: 1023, extra: 1 },
  ]) assert.throws(() => parseDocument({ ...baseData(), map }), DocumentError);
});

test("parser validates title, collection types, view parity, and zoom boundaries", () => {
  assert.throws(() => parseDocument({ ...baseData(), title: "   " }), DocumentError);
  for (const field of ["building_types", "buildings", "ranges"]) {
    assert.throws(() => parseDocument({ ...baseData(), [field]: {} }), DocumentError);
  }
  assert.throws(() => parseDocument({ ...baseData(), view: { center_x: 1, center_y: 2, zoom: 1 } }), DocumentError);
  for (const zoom of [0.01, 4]) assert.doesNotThrow(() => parseDocument({ ...baseData(), view: { center_x: 0, center_y: 0, zoom } }));
  for (const zoom of [0.009, 4.001]) assert.throws(() => parseDocument({ ...baseData(), view: { center_x: 0, center_y: 0, zoom } }), DocumentError);
});

test("parser rejects booleans in every Python integer or number field", () => {
  for (const field of ["center_x", "center_y", "zoom"]) {
    const data = baseData(); data.view[field] = true;
    assert.throws(() => parseDocument(data), DocumentError);
  }
  for (const field of ["x", "y", "width", "height"]) {
    const data = baseData();
    data.buildings = [{ id: "a", name: "A", type_id: "type-01", x: 14, y: 14, width: 1, height: 1, [field]: true }];
    assert.throws(() => parseDocument(data), DocumentError);
  }
  const range = baseData(); range.ranges = [{ id: "r", kind: "allowed", color: "#fff", locked: false, cells: [[true, 0]] }];
  assert.throws(() => parseDocument(range), DocumentError);
});

test("parser matches Python coercion and strict types for affiliation, locked, and cells", () => {
  const affiliation = baseData(); affiliation.buildings = [{ id: "a", name: "A", type_id: "type-01", x: 14, y: 14, width: 1, height: 1, affiliation: 123 }];
  assert.throws(() => parseDocument(affiliation), DocumentError);
  const cells = baseData(); cells.ranges = [{ id: "r", kind: "allowed", color: "#fff", cells: [[0, 0, 1]] }];
  assert.throws(() => parseDocument(cells), DocumentError);
  const locked = baseData(); locked.buildings = [{ id: "a", name: "A", type_id: "type-01", x: 14, y: 14, width: 1, height: 1, locked: "false" }];
  assert.equal(parseDocument(locked).buildings[0].locked, true);
});

test("parser rejects colliding buildings", () => {
  const data = baseData();
  data.buildings = [
    { id: "a", name: "A", type_id: "type-01", x: 14, y: 14, width: 1, height: 1 },
    { id: "b", name: "B", type_id: "type-01", x: 14, y: 14, width: 1, height: 1 },
  ];
  assert.throws(() => parseDocument(data), DocumentError);
});

test("all three editor entry paths call the engine", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /PNSMapEngine\.createNewDocument\s*\(/);
  assert.match(html, /PNSMapEngine\.loadDocument\s*\(\s*result\.map\.documentData/);
  assert.match(html, /PNSMapEngine\.loadDocument\s*\(\s*shared\.map\.documentData\s*,\s*\{\s*readOnly:\s*true/s);
  assert.equal((html.match(/mountMapRenderer\(\);/g) ?? []).length, 3);
  assert.match(html, /canvasPlaceholder[\s\S]*classList\.add\("hidden"\)/);
});
