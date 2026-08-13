import { parseTemplate, serializeTemplate } from "../editor/editor-template.js";

export const MAP_TEMPLATE_ADMIN_API_URL = "https://dpmjwsnqkuzetyvfcmfr.supabase.co/functions/v1/map-template-admin";

export class TemplateAdminError extends Error {
  constructor(message, { status = 0, code = "REQUEST_ERROR" } = {}) { super(message); this.status = status; this.code = code; }
}

export function validateTemplateNames(names) {
  const result = {};
  for (const field of ["name_ko", "name_en", "name_ja", "name_ru"]) {
    if (typeof names?.[field] !== "string" || !names[field].trim()) throw new TypeError("All four template names are required.");
    result[field] = names[field].trim();
  }
  return result;
}

export function createTemplateAdminClient({ fetchImpl = globalThis.fetch, auth = globalThis.S967AdminAuth, endpoint = MAP_TEMPLATE_ADMIN_API_URL } = {}) {
  let linkedTemplateId = null, linkedTemplateNames = null, linkedUpdatedAt = null;
  async function request(method, body = null, id = null) {
    const options = { method, headers: { ...(auth?.authorizationHeaders?.() ?? {}) } };
    if (body !== null) { options.headers["Content-Type"] = "application/json"; options.body = JSON.stringify(body); }
    let response;
    try { response = await fetchImpl(id ? `${endpoint}?id=${encodeURIComponent(id)}` : endpoint, options); }
    catch (error) { throw new TemplateAdminError("Network request failed.", { code: "NETWORK_ERROR" }); }
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401) auth?.clearToken?.();
      throw new TemplateAdminError(result.error || result.message || `HTTP_${response.status}`, { status: response.status, code: result.error || `HTTP_${response.status}` });
    }
    return result;
  }
  function canonical(input) { return serializeTemplate(parseTemplate(input)); }
  function link(template) {
    linkedTemplateId = template.id;
    linkedTemplateNames = Object.fromEntries(["name_ko", "name_en", "name_ja", "name_ru"].map(field => [field, template[field]]));
    linkedUpdatedAt = template.updated_at ?? null; return state();
  }
  function clearLink() { linkedTemplateId = null; linkedTemplateNames = null; linkedUpdatedAt = null; return state(); }
  function state() { return { linkedTemplateId, linkedTemplateNames: linkedTemplateNames && { ...linkedTemplateNames }, linkedUpdatedAt }; }
  return {
    state, clearLink,
    async list() { const result = await request("GET"); return Array.isArray(result.templates) ? result.templates : []; },
    async load(id) { const result = await request("GET", null, id); const templateData = canonical(result.template?.template_data); return { templateData, linked: link(result.template), template: result.template }; },
    async create(names, input) { const templateData = canonical(input), result = await request("POST", { action: "create_template", ...validateTemplateNames(names), template_data: templateData }); return { templateData, linked: link(result.template), template: result.template }; },
    async replace(input) {
      if (!linkedTemplateId) throw new TemplateAdminError("No server template is linked.", { code: "NOT_LINKED" });
      const templateData = canonical(input), id = linkedTemplateId;
      try { const result = await request("POST", { action: "replace_template_file", id, template_data: templateData }); return { templateData, linked: link(result.template), template: result.template }; }
      catch (error) { if (error.status === 404) clearLink(); throw error; }
    },
  };
}
