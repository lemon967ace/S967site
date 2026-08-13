import { parseDocument, serializeDocument } from "./editor-document.js";

export const RECOVERY_DB_NAME = "s967-map-recovery";
export const RECOVERY_STORE_NAME = "snapshots";
export const RECOVERY_VERSION = 1;
export const AUTOSAVE_DEBOUNCE_MS = 3000;
export const MAX_UNSAVED_RECOVERIES = 5;

export function recoveryKey(accountId, sourceKind, mapId, recoveryDocumentId) {
  const account = requireText(accountId, "accountId");
  if (sourceKind === "saved") return `${account}:saved:${requireText(mapId, "mapId")}`;
  if (!new Set(["new", "imported"]).has(sourceKind)) throw new TypeError("Invalid recovery source kind.");
  return `${account}:unsaved:${requireText(recoveryDocumentId, "recoveryDocumentId")}`;
}

export function createRecoverySnapshot({ accountId, sourceKind, mapId = null, recoveryDocumentId = null, documentData, mutationRevision, tabId, autosavedAt = new Date().toISOString(), serverUpdatedAt = null }) {
  if (!Number.isInteger(mutationRevision) || mutationRevision < 0) throw new TypeError("mutationRevision must be a non-negative integer.");
  const canonical = serializeDocument(parseDocument(documentData));
  const key = recoveryKey(accountId, sourceKind, mapId, recoveryDocumentId);
  return { version: RECOVERY_VERSION, key, accountId, sourceKind, mapId: sourceKind === "saved" ? mapId : null, recoveryDocumentId: sourceKind === "saved" ? null : recoveryDocumentId, documentData: canonical, title: canonical.title, autosavedAt, mutationRevision, tabId: requireText(tabId, "tabId"), serverUpdatedAt };
}

export function validateRecoverySnapshot(value) {
  if (!value || value.version !== RECOVERY_VERSION || typeof value !== "object") throw new TypeError("Invalid recovery snapshot.");
  const expected = recoveryKey(value.accountId, value.sourceKind, value.mapId, value.recoveryDocumentId);
  if (value.key !== expected || typeof value.autosavedAt !== "string" || !Number.isFinite(Date.parse(value.autosavedAt))) throw new TypeError("Invalid recovery metadata.");
  return createRecoverySnapshot(value);
}

export function createRecoveryStorage({ indexedDB = globalThis.indexedDB } = {}) {
  if (!indexedDB) return unavailableStorage();
  const open = () => new Promise((resolve, reject) => {
    const request = indexedDB.open(RECOVERY_DB_NAME, 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(RECOVERY_STORE_NAME)) request.result.createObjectStore(RECOVERY_STORE_NAME, { keyPath: "key" }); };
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error ?? new Error("Recovery database failed."));
  });
  const transaction = async (mode, operation) => { const db = await open(); try { return await new Promise((resolve, reject) => { const tx = db.transaction(RECOVERY_STORE_NAME, mode), store = tx.objectStore(RECOVERY_STORE_NAME); operation(store, resolve, reject); tx.onerror = () => reject(tx.error); }); } finally { db.close(); } };
  return {
    available: true,
    async put(snapshot) { const valid = validateRecoverySnapshot(snapshot); return transaction("readwrite", (store, resolve, reject) => { const request = store.put(valid); request.onsuccess = () => resolve(valid); request.onerror = () => reject(request.error); }); },
    async get(key) { return transaction("readonly", (store, resolve, reject) => { const request = store.get(key); request.onsuccess = () => { try { resolve(request.result ? validateRecoverySnapshot(request.result) : null); } catch (error) { reject(error); } }; request.onerror = () => reject(request.error); }); },
    async delete(key) { return transaction("readwrite", (store, resolve, reject) => { const request = store.delete(key); request.onsuccess = () => resolve(true); request.onerror = () => reject(request.error); }); },
    async list(accountId) { return transaction("readonly", (store, resolve, reject) => { const request = store.getAll(); request.onsuccess = () => { try { resolve(request.result.filter(item => item.accountId === accountId).map(validateRecoverySnapshot).sort(newestFirst)); } catch (error) { reject(error); } }; request.onerror = () => reject(request.error); }); },
    async cleanup(accountId, limit = MAX_UNSAVED_RECOVERIES) { const items = (await this.list(accountId)).filter(item => item.sourceKind !== "saved"); await Promise.all(items.slice(limit).map(item => this.delete(item.key))); },
  };
}

export function createAutosaveController({ storage, getContext, setTimeoutImpl = setTimeout, clearTimeoutImpl = clearTimeout, debounceMs = AUTOSAVE_DEBOUNCE_MS, onSaved = () => {}, onError = () => {} }) {
  let timer = null, pendingRevision = -1, writing = false;
  async function flush() {
    if (timer) clearTimeoutImpl(timer); timer = null;
    const context = getContext();
    if (!context || context.readOnly || !context.accountId || pendingRevision < 0) return null;
    const snapshot = createRecoverySnapshot({ ...context, mutationRevision: pendingRevision });
    writing = true;
    try {
      const existing = await storage.get(snapshot.key).catch(() => null);
      if (existing && (existing.mutationRevision > snapshot.mutationRevision || Date.parse(existing.autosavedAt) > Date.parse(snapshot.autosavedAt))) return existing;
      await storage.put(snapshot); if (snapshot.sourceKind !== "saved") await storage.cleanup(snapshot.accountId); onSaved(snapshot); return snapshot;
    } catch (error) { onError(error); return null; } finally { writing = false; }
  }
  function schedule(revision) { if (!Number.isInteger(revision) || revision < 0) return; pendingRevision = Math.max(pendingRevision, revision); if (timer) clearTimeoutImpl(timer); timer = setTimeoutImpl(flush, debounceMs); }
  function cancel() { if (timer) clearTimeoutImpl(timer); timer = null; pendingRevision = -1; }
  return { schedule, flush, cancel, getState: () => ({ pending: Boolean(timer), pendingRevision, writing }) };
}

function newestFirst(a, b) { return Date.parse(b.autosavedAt) - Date.parse(a.autosavedAt) || b.mutationRevision - a.mutationRevision; }
function requireText(value, field) { if (typeof value !== "string" || !value.trim()) throw new TypeError(`${field} is required.`); return value.trim(); }
function unavailableStorage() { return { available: false, async put() { throw new Error("IndexedDB is unavailable."); }, async get() { return null; }, async delete() { return false; }, async list() { return []; }, async cleanup() {} }; }
