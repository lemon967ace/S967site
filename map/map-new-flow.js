(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.S967MapNewFlow = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const NAME_FIELDS = { ko: "name_ko", en: "name_en", ja: "name_ja", ru: "name_ru" };

  function templateName(template, language) {
    const field = NAME_FIELDS[language] || NAME_FIELDS.en;
    return typeof template?.[field] === "string" ? template[field] : "";
  }

  function initialSelection(templates) {
    const defaults = Array.isArray(templates)
      ? templates.filter(template => template?.is_default === true)
      : [];
    if (defaults.length === 1 && typeof defaults[0].id === "string") {
      return { value: defaults[0].id, state: "default" };
    }
    return { value: "", state: defaults.length > 1 ? "multiple" : "none" };
  }

  function editorUrl({ title, selection }) {
    const trimmed = typeof title === "string" ? title.trim() : "";
    if (!trimmed) throw new TypeError("MAP_NAME_REQUIRED");
    if ([...trimmed].length > 100) throw new RangeError("MAP_NAME_TOO_LONG");
    if (selection !== "empty" && (typeof selection !== "string" || !selection)) {
      throw new TypeError("MAP_TYPE_REQUIRED");
    }
    const params = new URLSearchParams({ new: "1", template: selection, title: trimmed });
    return `/map/editor/?${params.toString()}`;
  }

  return { templateName, initialSelection, editorUrl };
});
