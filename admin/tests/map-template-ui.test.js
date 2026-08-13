import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const inlineScript = html.slice(html.lastIndexOf("<script>") + 8, html.lastIndexOf("</script>"));
const between = (start, end) => html.slice(html.indexOf(start), html.indexOf(end, html.indexOf(start)));

test("고정맵 관리 탭과 기존 admin 내부 섹션이 존재한다", () => {
  assert.match(html, /data-admin-tab="maptemplates"/);
  assert.match(html, /data-admin-section="maptemplates"/);
  assert.match(html, /고정맵 템플릿 관리/);
  assert.doesNotMatch(html, /\/map\/admin\//);
});

test("관리자 템플릿 API endpoint만 사용한다", () => {
  assert.match(html, /functions\/v1\/map-template-admin/);
  assert.doesNotMatch(html, /functions\/v1\/map-template-list|functions\/v1\/map-template-load/);
});

test("템플릿 API는 authenticatedAdminFetch를 재사용한다", () => {
  const api = between("async function mapTemplateApiRequest", "async function readIsotemplateFile");
  assert.match(api, /authenticatedAdminFetch/);
  assert.match(api, /MAP_TEMPLATE_ADMIN_API_URL/);
});

test("legacy secret 인증을 추가하지 않았다", () => {
  const api = between("const MAP_TEMPLATE_ADMIN_API_URL", "const SUPABASE_PUBLIC_STORAGE_BASE");
  assert.doesNotMatch(api, /x-admin-secret|ADMIN_SECRET/);
});

test("신규 등록 폼은 네 언어 이름을 모두 제공한다", () => {
  for (const id of ["newMapTemplateNameKo", "newMapTemplateNameEn", "newMapTemplateNameJa", "newMapTemplateNameRu"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /한국어 이름/);
  assert.match(html, /English name/);
  assert.match(html, /日本語名/);
  assert.match(html, /Русское название/);
});

test("파일 입력은 isotemplate accept를 사용한다", () => {
  assert.match(html, /id="newMapTemplateFile"[^>]*type="file"[^>]*accept="\.isotemplate"/);
  assert.match(html, /replaceInput\.accept = "\.isotemplate"/);
});

test("클라이언트 파일 크기 제한은 서버의 8 MiB와 같다", () => {
  assert.match(html, /MAP_TEMPLATE_MAX_FILE_BYTES[\s\S]*8 \* 1024 \* 1024/);
  assert.match(html, /file\.size > MAP_TEMPLATE_MAX_FILE_BYTES/);
  assert.match(html, /파일 크기는 8 MiB 이하여야 합니다/);
});

test("파일 읽기 실패와 빈 파일을 구분한다", () => {
  assert.match(html, /await file\.text\(\)/);
  assert.match(html, /파일을 읽지 못했습니다/);
  assert.match(html, /if \(!text\.trim\(\)\)/);
  assert.match(html, /파일이 비어 있습니다/);
});

test("malformed JSON은 요청 전에 처리한다", () => {
  const reader = between("async function readIsotemplateFile", "function mapTemplateNamesFromInputs");
  assert.match(reader, /JSON\.parse\(text\)/);
  assert.match(reader, /JSON 형식이 올바르지 않습니다/);
  assert.doesNotMatch(reader, /mapTemplateApiRequest/);
});

test("create_template payload가 서버 계약과 일치한다", () => {
  const create = between("createMapTemplateButton.addEventListener", "(async function bootstrapAdminSession");
  assert.match(create, /action: "create_template"/);
  assert.match(create, /\.\.\.templateNames/);
  assert.match(create, /template_data: templateData/);
});

test("등록 성공 후 입력을 비우고 목록을 갱신한다", () => {
  const create = between("createMapTemplateButton.addEventListener", "(async function bootstrapAdminSession");
  assert.ok(create.indexOf('await mapTemplateApiRequest("POST"') < create.indexOf('newMapTemplateNameKo.value = ""'));
  assert.match(create, /newMapTemplateFile\.value = ""/);
  assert.match(create, /await loadMapTemplates\(\)/);
});

test("등록 실패 시 입력을 초기화하지 않는다", () => {
  const create = between("createMapTemplateButton.addEventListener", "(async function bootstrapAdminSession");
  const failure = create.slice(create.indexOf("} catch (error)"));
  assert.doesNotMatch(failure, /newMapTemplateNameKo\.value|newMapTemplateFile\.value/);
  assert.match(failure, /등록하지 못했습니다/);
});

test("이름 수정 inline UI를 제공한다", () => {
  assert.match(html, /editButton\.textContent = "이름 수정"/);
  assert.match(html, /editArea\.className = "hidden"/);
  assert.match(html, /editArea\.classList\.remove\("hidden"\)/);
  assert.match(html, /saveButton\.textContent = "저장"/);
});

test("update_template_names payload에는 네 이름과 ID가 들어간다", () => {
  const update = between('saveButton.addEventListener("click"', 'replaceButton.addEventListener("click"');
  assert.match(update, /action: "update_template_names"/);
  assert.match(update, /id: template\.id/);
  assert.match(update, /\.\.\.updatedNames/);
});

test("이름 수정은 template_data를 보내지 않는다", () => {
  const update = between('saveButton.addEventListener("click"', 'replaceButton.addEventListener("click"');
  assert.doesNotMatch(update, /template_data/);
});

test("파일 교체 UI를 제공한다", () => {
  assert.match(html, /replaceButton\.textContent = "파일 교체"/);
  assert.match(html, /replaceInput\.type = "file"/);
  assert.match(html, /replaceInput\.click\(\)/);
});

test("replace_template_file payload가 서버 계약과 일치한다", () => {
  const replace = between('replaceInput.addEventListener("change"', 'deleteButton.addEventListener("click"');
  assert.match(replace, /action: "replace_template_file"/);
  assert.match(replace, /id: template\.id/);
  assert.match(replace, /template_data: templateData/);
});

test("파일 교체는 네 이름을 덮어쓰지 않는다", () => {
  const replace = between('replaceInput.addEventListener("change"', 'deleteButton.addEventListener("click"');
  assert.doesNotMatch(replace, /name_ko|name_en|name_ja|name_ru/);
});

test("삭제는 snapshot 안내가 포함된 confirmation을 거친다", () => {
  const deletion = between('deleteButton.addEventListener("click"', "card.append(");
  assert.match(deletion, /confirm\(/);
  assert.match(deletion, /이 고정맵 템플릿을 삭제하시겠습니까/);
  assert.match(deletion, /사용자 맵은 삭제되지 않습니다/);
});

test("delete_template payload와 성공 후 갱신이 존재한다", () => {
  const deletion = between('deleteButton.addEventListener("click"', "card.append(");
  assert.match(deletion, /action: "delete_template"/);
  assert.match(deletion, /id: template\.id/);
  assert.match(deletion, /await loadMapTemplates\(\)/);
});

test("템플릿 이름과 metadata는 textContent로 안전하게 출력한다", () => {
  const render = between("function renderMapTemplates", "async function loadMapTemplates");
  assert.match(render, /title\.textContent = template\.name_ko/);
  assert.match(render, /english\.textContent/);
  assert.match(render, /japanese\.textContent/);
  assert.match(render, /russian\.textContent/);
  assert.doesNotMatch(render, /innerHTML/);
});

test("빈 목록 상태가 오류와 분리되어 있다", () => {
  assert.match(html, /등록된 고정맵이 없습니다/);
  assert.match(html, /if \(!mapTemplates\.length\)/);
});

test("목록 loading 상태가 존재한다", () => {
  assert.match(html, /setStatus\(mapTemplateListStatus, "불러오는 중…"\)/);
});

test("목록 API 오류 상태가 존재한다", () => {
  assert.match(html, /고정맵 목록을 불러오지 못했습니다/);
  assert.match(html, /mapTemplateListStatus[\s\S]*true/);
});

test("401은 기존 공통 session invalidation 흐름으로 처리된다", () => {
  assert.match(html, /async function authenticatedAdminFetch/);
  assert.match(html, /response\.status === 401/);
  assert.match(html, /S967AdminAuth\.clearToken\(\)/);
  assert.match(html, /showLogin\(/);
});

test("등록과 항목별 mutation은 중복 요청을 막는다", () => {
  assert.match(html, /createMapTemplateButton\.disabled = true/);
  assert.match(html, /saveButton\.disabled = true/);
  assert.match(html, /replaceButton\.disabled = true/);
  assert.match(html, /deleteButton\.disabled = true/);
  assert.match(html, /mapTemplatesLoading/);
});

test("기존 관리자 endpoint와 로그인·로그아웃 기능은 유지된다", () => {
  for (const endpoint of ["upload-admin", "staff-admin", "wk-admin", "wk-export-email", "inquiry-admin", "group-buy-admin", "group-buy-export-email", "admin-login", "admin-session", "admin-logout"]) {
    assert.match(html, new RegExp(`functions/v1/${endpoint}`));
  }
  assert.match(html, /S967AdminAuth\.login/);
  assert.match(html, /S967AdminAuth\.logout/);
  assert.match(html, /S967AdminAuth\.validate/);
});

test("관리자 inline JavaScript 전체가 구문 분석된다", () => {
  assert.doesNotThrow(() => new Function(inlineScript));
});
