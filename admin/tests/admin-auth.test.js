import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

await import("../admin-auth.js");
const auth = globalThis.S967AdminAuth;

function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

function response(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

test("uses the exact admin sessionStorage key", () => {
  assert.equal(auth.STORAGE_KEY, "s967-admin-session-token");
});

test("login stores the returned token and never stores the password", async () => {
  const store = storage();
  await auth.login("secret-password", {
    url: "/login", storage: store,
    fetchImpl: async () => response(200, { ok: true, sessionToken: "raw-token" }),
  });
  assert.equal(auth.getToken(store), "raw-token");
  assert.notEqual(auth.getToken(store), "secret-password");
});

test("invalid password stores no token", async () => {
  const store = storage();
  await assert.rejects(() => auth.login("wrong", {
    url: "/login", storage: store,
    fetchImpl: async () => response(401, { error: "INVALID_CREDENTIALS" }),
  }));
  assert.equal(auth.getToken(store), "");
});

test("valid bootstrap restores an administrator session", async () => {
  const store = storage();
  auth.setToken("valid", store);
  assert.equal(await auth.validate({ url: "/session", storage: store,
    fetchImpl: async (_url, options) => {
      assert.equal(options.headers.Authorization, "Bearer valid");
      return response(200, { ok: true });
    } }), true);
});

for (const [name, fetchImpl] of [
  ["invalid", async () => response(401, { error: "INVALID_SESSION" })],
  ["expired", async () => response(401, { error: "SESSION_EXPIRED" })],
  ["server failure", async () => response(500, { error: "DATABASE_ERROR" })],
  ["network failure", async () => { throw new Error("offline"); }],
]) {
  test(`${name} bootstrap fails closed and clears the token`, async () => {
    const store = storage();
    auth.setToken("token", store);
    assert.equal(await auth.validate({ url: "/session", storage: store, fetchImpl }), false);
    assert.equal(auth.getToken(store), "");
  });
}

test("logout removes the client token even when the network fails", async () => {
  const store = storage();
  auth.setToken("token", store);
  await assert.rejects(() => auth.logout({ url: "/logout", storage: store,
    fetchImpl: async () => { throw new Error("offline"); } }));
  assert.equal(auth.getToken(store), "");
});

test("logout sends the token to the server", async () => {
  const store = storage();
  auth.setToken("token", store);
  await auth.logout({ url: "/logout", storage: store, fetchImpl: async (_url, options) => {
    assert.equal(options.headers.Authorization, "Bearer token");
    return response(200, { ok: true });
  } });
  assert.equal(auth.getToken(store), "");
});

test("server implementation hashes tokens and stores no raw_token column", async () => {
  const migration = await readFile(new URL("../../supabase/migrations/202608130001_admin_sessions.sql", import.meta.url), "utf8");
  const shared = await readFile(new URL("../../supabase/functions/_shared/admin-auth.ts", import.meta.url), "utf8");
  assert.match(shared, /SHA-256/);
  assert.match(shared, /Uint8Array\(32\)/);
  assert.doesNotMatch(migration, /raw_token/i);
  assert.match(migration, /token_hash text not null unique/);
});

test("admin sessions are separate from map sessions", async () => {
  const files = await Promise.all([
    "admin-login", "admin-session", "admin-logout",
  ].map((name) => readFile(new URL(`../../supabase/functions/${name}/index.ts`, import.meta.url), "utf8")));
  assert.equal(files.some((source) => source.includes("map_sessions")), false);
});

test("CORS is restricted to the production origin and Authorization is allowed", async () => {
  const shared = await readFile(new URL("../../supabase/functions/_shared/admin-auth.ts", import.meta.url), "utf8");
  assert.match(shared, /https:\/\/s967\.org/);
  assert.doesNotMatch(shared, /Allow-Origin[^\n]*\*/);
  assert.match(shared, /authorization, x-client-info, apikey, content-type/);
});

test("admin page no longer sends or retains an admin password", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.doesNotMatch(html, /x-admin-secret/);
  assert.doesNotMatch(html, /let adminSecret\s*=/);
  assert.match(html, /S967AdminAuth\.login/);
  assert.match(html, /S967AdminAuth\.validate/);
});

test("admin auth never uses localStorage or the map token key", async () => {
  const source = await readFile(new URL("../admin-auth.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /localStorage/);
  assert.doesNotMatch(source, /s967-map-session-token/);
});
