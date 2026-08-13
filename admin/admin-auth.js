(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.S967AdminAuth = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const STORAGE_KEY = "s967-admin-session-token";
  const AUTH_ERRORS = new Set(["UNAUTHORIZED", "INVALID_SESSION", "SESSION_EXPIRED"]);
  const REQUEST_TIMEOUT_MS = 10000;

  function storageOrDefault(storage) {
    return storage || globalThis.sessionStorage;
  }

  function getToken(storage) {
    return storageOrDefault(storage).getItem(STORAGE_KEY) || "";
  }

  function setToken(token, storage) {
    storageOrDefault(storage).setItem(STORAGE_KEY, token);
  }

  function clearToken(storage) {
    storageOrDefault(storage).removeItem(STORAGE_KEY);
  }

  function authorizationHeaders(storage) {
    const token = getToken(storage);
    return token ? { Authorization: `Bearer ${token}` } : {};
  }


  async function fetchWithTimeout(fetchImpl, url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetchImpl(url, { ...options, signal: controller.signal });
    } catch (error) {
      if (error?.name === "AbortError") {
        const timeoutError = new Error("REQUEST_TIMEOUT");
        timeoutError.code = "REQUEST_TIMEOUT";
        throw timeoutError;
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async function readResult(response) {
    return response.json().catch(() => ({}));
  }

  function errorFrom(response, result) {
    const code = result.error || result.message || `HTTP_${response.status}`;
    const error = new Error(code);
    error.code = code;
    error.status = response.status;
    return error;
  }

  function handleAuthError(error, storage) {
    if (error && (error.status === 401 || AUTH_ERRORS.has(error.code))) {
      clearToken(storage);
      return true;
    }
    return false;
  }

  async function login(password, options = {}) {
    const fetchImpl = options.fetchImpl || globalThis.fetch;
    const response = await fetchWithTimeout(fetchImpl, options.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const result = await readResult(response);
    if (!response.ok || !result.sessionToken) throw errorFrom(response, result);
    setToken(result.sessionToken, options.storage);
    return result;
  }

  async function validate(options = {}) {
    const token = getToken(options.storage);
    if (!token) return false;
    try {
      const response = await fetchWithTimeout(options.fetchImpl || globalThis.fetch, options.url, {
        method: "GET",
        headers: authorizationHeaders(options.storage),
      });
      const result = await readResult(response);
      if (!response.ok || result.ok !== true) throw errorFrom(response, result);
      return true;
    } catch (error) {
      clearToken(options.storage);
      return false;
    }
  }

  async function logout(options = {}) {
    try {
      const token = getToken(options.storage);
      if (token) {
        await fetchWithTimeout(options.fetchImpl || globalThis.fetch, options.url, {
          method: "POST",
          headers: authorizationHeaders(options.storage),
        });
      }
    } finally {
      clearToken(options.storage);
    }
  }

  return { STORAGE_KEY, getToken, setToken, clearToken, authorizationHeaders,
    handleAuthError, login, validate, logout };
});
