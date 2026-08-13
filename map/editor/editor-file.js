import { parseDocument, serializeDocument } from "./editor-document.js";

export const MAX_ISOMAP_FILE_BYTES = 32 * 1024 * 1024;

export class IsomapFileError extends Error {
  constructor(code, cause = null) { super(code, cause ? { cause } : undefined); this.name = "IsomapFileError"; this.code = code; }
}

export function canonicalIsomap(input) { return serializeDocument(parseDocument(input)); }

export function exportIsomap(engine, { title } = {}) {
  const raw = engine.exportDocument();
  if (typeof title === "string" && title.trim()) raw.title = title.trim();
  return canonicalIsomap(raw);
}

export function isomapFilename(title) {
  const cleaned = typeof title === "string" ? title.normalize("NFC").trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/[. ]+$/g, "").slice(0, 120).trim() : "";
  return `${cleaned.replace(/_/g, "").trim() ? cleaned : "map"}.isomap`;
}

export function createIsomapDownload(engine, options = {}) {
  const documentData = exportIsomap(engine, options);
  return { documentData, filename: isomapFilename(documentData.title), text: JSON.stringify(documentData, null, 2) };
}

export async function readIsomapFile(file, { maxBytes = MAX_ISOMAP_FILE_BYTES } = {}) {
  if (!file) return null;
  if (typeof file.size === "number" && file.size > maxBytes) throw new IsomapFileError("FILE_TOO_LARGE");
  let text;
  try { text = await file.text(); } catch (error) { throw new IsomapFileError("FILE_READ_FAILED", error); }
  if (!text.trim()) throw new IsomapFileError("EMPTY_FILE");
  let raw;
  try { raw = JSON.parse(text); } catch (error) { throw new IsomapFileError("INVALID_JSON", error); }
  try { return canonicalIsomap(raw); } catch (error) {
    const message = String(error?.message || "");
    if (message.includes("format")) throw new IsomapFileError("WRONG_FORMAT", error);
    if (message.includes("version")) throw new IsomapFileError("UNSUPPORTED_VERSION", error);
    throw new IsomapFileError("INVALID_DOCUMENT", error);
  }
}

export function triggerIsomapDownload(download, documentRef = globalThis.document, urlApi = globalThis.URL) {
  const blob = new Blob([download.text], { type: "application/json;charset=utf-8" }), url = urlApi.createObjectURL(blob), anchor = documentRef.createElement("a");
  anchor.href = url; anchor.download = download.filename; anchor.click(); urlApi.revokeObjectURL(url);
}
