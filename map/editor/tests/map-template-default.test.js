import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as engine from "../editor-engine.js";

await import("../../map-new-flow.js");
const flow = globalThis.S967MapNewFlow;
const root = new URL("../../../", import.meta.url);
const read = path => readFile(new URL(path, root), "utf8");
const [migration, adminApi, listApi, loadApi, adminHtml, mapHtml, editorHtml] = await Promise.all([
  read("supabase/migrations/202608130003_map_template_default.sql"),
  read("supabase/functions/map-template-admin/index.ts"),
  read("supabase/functions/map-template-list/index.ts"),
  read("supabase/functions/map-template-load/index.ts"),
  read("admin/index.html"), read("map/index.html"), read("map/editor/index.html"),
]);

const template = () => ({
  format: "pns-map-template", version: 1,
  map: { min_x: 0, max_x: 511, min_y: 0, max_y: 1023 },
  fixed_building_types: [{ id: "ft", name: "Fixed", color: "#123456", width: 1, height: 1 }],
  fixed_buildings: [{ id: "fb", name: "Center", type_id: "ft", x: 20, y: 20 }],
  fixed_ranges: [{ id: "fr", kind: "blocked", color: "#654321", cells: [[22, 22]] }],
  view: { center_x: 20, center_y: 20, zoom: 1 },
});

test("new migration adds a non-null false is_default column", async () => {
  assert.match(migration, /add column if not exists is_default boolean not null default false/);
  assert.doesNotMatch(await read("supabase/migrations/202608130002_map_templates.sql"), /is_default/);
});

test("partial unique index permits at most one true default", () => {
  assert.match(migration, /create unique index if not exists map_templates_single_default_idx/);
  assert.match(migration, /on public\.map_templates \(\(is_default\)\)/);
  assert.match(migration, /where is_default = true/);
});

test("default RPC locks, validates, clears, and sets in one transaction", () => {
  assert.match(migration, /function public\.set_map_template_default\(p_template_id uuid\)/);
  assert.match(migration, /lock table public\.map_templates in share row exclusive mode/);
  assert.ok(migration.indexOf("not exists") < migration.indexOf("set is_default = false"));
  assert.match(migration, /set is_default = false/);
  assert.match(migration, /set is_default = true/);
});

test("RPC null input clears the default and keeps zero defaults valid", () => {
  assert.match(migration, /p_template_id is null/);
  assert.match(migration, /if p_template_id is not null then/);
  assert.match(migration, /return true/);
});

test("default RPC is service-role only", () => {
  assert.match(migration, /revoke all on function public\.set_map_template_default\(uuid\) from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.set_map_template_default\(uuid\) to service_role/);
});

test("admin list, detail, and mutation responses retain is_default", () => {
  assert.match(adminApi, /is_default,created_at,updated_at/);
  assert.match(adminApi, /select\("\*"\)/);
  assert.match(adminApi, /is_default/);
});

test("set_default_template uses UUID validation and atomic RPC", () => {
  const section = adminApi.slice(adminApi.indexOf('action === "set_default_template"'), adminApi.indexOf('if (!(await existing(id)))'));
  assert.match(adminApi, /if \(!UUID\.test\(id\)\)/);
  assert.match(section, /rpc\("set_map_template_default", \{ p_template_id: id \}\)/);
  assert.match(section, /data !== true[\s\S]*404/);
});

test("clear_default_template calls the same RPC with null", () => {
  const section = adminApi.slice(adminApi.indexOf('action === "clear_default_template"'), adminApi.indexOf('if (!['));
  assert.match(section, /p_template_id: null/);
  assert.match(section, /default_template_id: null/);
});

test("admin authentication still precedes every default action", () => {
  assert.ok(adminApi.indexOf("verifyAdminSession(req)") < adminApi.indexOf('action === "clear_default_template"'));
  assert.match(adminApi, /from\("admin_sessions"\)/);
});

test("deleting the default row does not nominate another template", () => {
  const deletion = adminApi.slice(adminApi.indexOf('from("map_templates").delete()'));
  assert.doesNotMatch(deletion, /set_map_template_default|is_default\s*=\s*true/);
});

test("public list includes is_default but never template_data", () => {
  assert.match(listApi, /name_ru,is_default,updated_at/);
  assert.doesNotMatch(listApi, /template_data/);
  assert.match(listApi, /order\("created_at"[\s\S]*order\("id"/);
});

test("public load exposes isDefault only as metadata", () => {
  assert.match(loadApi, /is_default,template_data/);
  assert.match(loadApi, /isDefault: data\.is_default/);
  assert.match(loadApi, /templateData: data\.template_data/);
});

test("admin cards show the current default and set or clear controls", () => {
  assert.match(adminHtml, /template\.is_default === true/);
  assert.match(adminHtml, /defaultBadge\.textContent = "기본맵"/);
  assert.match(adminHtml, /"기본맵 해제"[\s\S]*"기본맵으로 지정"/);
});

test("admin default changes require both confirmations", () => {
  assert.match(adminHtml, /이 고정맵을 기본맵으로 지정하시겠습니까/);
  assert.match(adminHtml, /이미 만들어진 사용자 맵은 변경되지 않습니다/);
  assert.match(adminHtml, /기본맵 지정을 해제하시겠습니까/);
  assert.match(adminHtml, /사용자가 맵 종류를 직접 선택해야 합니다/);
});

test("admin UI sends set and clear actions without breaking CRUD", () => {
  for (const action of ["set_default_template", "clear_default_template", "create_template", "update_template_names", "replace_template_file", "delete_template"]) {
    assert.match(adminHtml, new RegExp(action));
  }
});

test("one default is selected automatically", () => {
  assert.deepEqual(flow.initialSelection([{ id: "a", is_default: false }, { id: "b", is_default: true }]), { value: "b", state: "default" });
});

test("zero defaults requires an explicit selection", () => {
  assert.deepEqual(flow.initialSelection([{ id: "a", is_default: false }]), { value: "", state: "none" });
});

test("multiple abnormal defaults never chooses the first", () => {
  assert.deepEqual(flow.initialSelection([{ id: "a", is_default: true }, { id: "b", is_default: true }]), { value: "", state: "multiple" });
});

test("template names follow the active language field", () => {
  const item = { name_ko: "한국어", name_en: "English", name_ja: "日本語", name_ru: "Русский" };
  assert.deepEqual(["ko", "en", "ja", "ru"].map(language => flow.templateName(item, language)), ["한국어", "English", "日本語", "Русский"]);
});

test("default untouched, explicit empty, and another template build distinct editor URLs", () => {
  const selected = flow.initialSelection([{ id: "default-id", is_default: true }]).value;
  assert.match(flow.editorUrl({ title: "Mine", selection: selected }), /template=default-id/);
  assert.match(flow.editorUrl({ title: "Mine", selection: "empty" }), /template=empty/);
  assert.match(flow.editorUrl({ title: "Mine", selection: "other-id" }), /template=other-id/);
});

test("map title is required, bounded, and independent from template names", () => {
  assert.throws(() => flow.editorUrl({ title: " ", selection: "empty" }), /MAP_NAME_REQUIRED/);
  assert.throws(() => flow.editorUrl({ title: "x".repeat(101), selection: "empty" }), /MAP_NAME_TOO_LONG/);
  assert.match(flow.editorUrl({ title: "User title", selection: "template-name" }), /title=User\+title/);
});

test("map UI contains one name-and-type form with explicit empty option", () => {
  assert.match(mapHtml, /id="newMapName"[^>]*maxlength="100"/);
  assert.match(mapHtml, /id="newMapType"/);
  assert.match(mapHtml, /empty\.value = "empty"/);
  assert.match(mapHtml, /newMapTitle[\s\S]*newMapName[\s\S]*newMapType/);
});

test("list loading disables creation and does not assume empty", () => {
  assert.match(mapHtml, /mapTemplatesState === "loading"/);
  assert.match(mapHtml, /createNewMapButton\.disabled[\s\S]*mapTemplatesState === "loading"/);
  assert.doesNotMatch(mapHtml, /initial\.value\s*\|\|\s*"empty"/);
});

test("list failure keeps no selection while allowing explicit empty", () => {
  assert.match(mapHtml, /mapTemplatesState = "error"/);
  assert.match(mapHtml, /newMapType\.value = ""/);
  assert.match(mapHtml, /templateListFailed/);
});

test("creation loads fresh detail without account or admin Authorization", () => {
  assert.match(mapHtml, /MAP_TEMPLATE_LOAD_URL[\s\S]*templateId=/);
  const load = mapHtml.slice(mapHtml.indexOf("const response = await fetch(\n            `${MAP_TEMPLATE_LOAD_URL}"), mapHtml.indexOf("sessionStorage.setItem(NEW_MAP_TEMPLATE_KEY"));
  assert.doesNotMatch(load, /authorizationHeaders|Authorization/);
  assert.match(load, /result\.template\?\.templateData/);
});

test("detail 404 creates no document and refreshes the selector", () => {
  const create = mapHtml.slice(mapHtml.indexOf('createNewMapButton.addEventListener("click"'), mapHtml.indexOf("function openMap"));
  assert.match(create, /response\.status === 404/);
  assert.match(create, /selectedTemplateUnavailable/);
  assert.match(create, /await loadMapTemplatesForNewMap\(\)/);
  assert.ok(create.indexOf("response.status === 404") < create.indexOf("window.location.href = url"));
});

test("load failure never falls back to empty and prevents navigation", () => {
  const create = mapHtml.slice(mapHtml.indexOf('createNewMapButton.addEventListener("click"'), mapHtml.indexOf("function openMap"));
  assert.match(create, /throw new Error\("TEMPLATE_LOAD_FAILED"\)/);
  assert.doesNotMatch(create, /selection\s*=\s*"empty"/);
  assert.match(create, /createNewMapButton\.disabled = false/);
});

test("creation disables duplicate clicks through detail load and navigation", () => {
  const create = mapHtml.slice(mapHtml.indexOf('createNewMapButton.addEventListener("click"'), mapHtml.indexOf("function openMap"));
  assert.match(create, /if \(createNewMapButton\.disabled\) return/);
  assert.ok(create.indexOf("createNewMapButton.disabled = true") < create.indexOf("await fetch"));
});

test("editor consumes the exact transfer and uses canonical engine template creation", () => {
  assert.match(editorHtml, /transfer\.templateId !== entry\.templateId/);
  assert.match(editorHtml, /template = transfer\.templateData/);
  assert.match(editorHtml, /PNSMapEngine\.createNewDocument\(\{[\s\S]*title,[\s\S]*template,/);
  assert.doesNotMatch(editorHtml, /fixed_building_types\s*:/);
});

test("template application remains a deep fixed snapshot with empty user data", () => {
  const source = template();
  const document = engine.createNewDocument({ title: "User title", template: source });
  source.fixed_buildings[0].name = "Changed";
  assert.equal(document.title, "User title");
  assert.equal(document.fixedBuildings[0].name, "Center");
  assert.equal(document.buildingTypes.length, 7);
  assert.deepEqual(document.buildings, []);
  assert.deepEqual(document.ranges, []);
});

test("empty creation retains the canonical empty-document path", () => {
  const document = engine.createNewDocument({ title: "Empty" });
  assert.deepEqual([document.fixedBuildingTypes, document.fixedBuildings, document.fixedRanges], [[], [], []]);
  assert.equal(document.buildingTypes.length, 7);
});

test("saved and shared editor entry paths remain unchanged", () => {
  assert.match(editorHtml, /editorMode === "saved"[\s\S]*await loadSavedMap/);
  assert.match(editorHtml, /editorMode === "shared"[\s\S]*prepareSharedMap/);
  assert.match(editorHtml, /PNSMapEngine\.loadDocument\([\s\S]*result\.map\.documentData/);
});

test("there is no hardcoded fixed default map in either new-document path", async () => {
  const engineSource = await read("map/editor/editor-engine.js");
  assert.doesNotMatch(engineSource, /fixedBuildingTypes:\s*\[/);
  assert.doesNotMatch(mapHtml, /fixed_building_types\s*:/);
  assert.match(engineSource, /template \? applyTemplateToNewDocument/);
});
