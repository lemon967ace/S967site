export class MapSaveError extends Error {
  constructor(code, status = 0) { super(code); this.name = "MapSaveError"; this.code = code; this.status = status; }
}

export function createMapSaveManager({
  url, fetchImpl = globalThis.fetch, getToken, getMapId, setMapId, getName,
  exportDocument, getRevision, isReadOnly, onStateChange = () => {},
  onMetadata = () => {}, onSessionExpired = () => {},
}) {
  let saving = false;
  const state = () => ({ saving, mapId: getMapId() });

  async function save() {
    if (isReadOnly()) throw new MapSaveError("READ_ONLY");
    if (saving) return { skipped: true, reason: "ALREADY_SAVING" };
    const token = getToken();
    if (!token) throw new MapSaveError("UNAUTHORIZED", 401);
    const name = String(getName()).trim();
    if (!name) throw new MapSaveError("MAP_NAME_REQUIRED", 400);
    if (name.length > 100) throw new MapSaveError("MAP_NAME_TOO_LONG", 400);

    const revision = getRevision();
    const documentData = exportDocument();
    const requestMapId = getMapId() || null;
    saving = true; onStateChange(state());
    try {
      let response;
      try {
        response = await fetchImpl(url, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ mapId: requestMapId, name, documentData }),
        });
      } catch { throw new MapSaveError("NETWORK_ERROR"); }
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok || !result?.map?.id) {
        const code = typeof result?.error === "string" ? result.error : "MAP_SAVE_FAILED";
        if (["UNAUTHORIZED", "INVALID_SESSION", "SESSION_EXPIRED"].includes(code) || response.status === 401) onSessionExpired(code);
        throw new MapSaveError(code, response.status);
      }
      setMapId(result.map.id);
      onMetadata({ id: result.map.id, name: result.map.name, createdAt: result.map.createdAt, updatedAt: result.map.updatedAt, created: Boolean(result.created) });
      return { skipped: false, clean: getRevision() === revision, result, documentData, requestMapId };
    } finally {
      saving = false; onStateChange(state());
    }
  }

  return { save, getState: state };
}
