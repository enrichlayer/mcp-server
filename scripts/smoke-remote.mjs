// End-to-end smoke test for a deployed Enrich Layer MCP connector (authorization server + resource server on one origin).
// Usage: npm run build && ENRICHLAYER_API_KEY=<key> node scripts/smoke-remote.mjs https://mcp.staging.enrichlayer.com
// Registers a throwaway OAuth client, walks consent → code → token (iss/aud checked) → MCP initialize/tools/list/tools/call
// (enrich_credit_balance, 0 credits), then checks GET/DELETE 405s, refresh rotation, refresh-token reuse, the wrong-key
// path, and the discovery chain a client follows from the 401 challenge. Every step is asserted: the first mismatch
// prints FAIL and exits 1 (2 = no key or no build). The key, the client secret, codes and tokens are never printed.
// Each run leaves its client registration and a refresh token on the target environment until they expire.
// Run it against staging after every rollout and against production once.
import crypto from "node:crypto";
const BASE = (process.argv[2] || "https://mcp.staging.enrichlayer.com").replace(/\/+$/, "");
const API_KEY = process.env.ENRICHLAYER_API_KEY;
if (!API_KEY) { console.error("ENRICHLAYER_API_KEY missing"); process.exit(2); }
let allToolDefs;
try { ({ allToolDefs } = await import(new URL("../build/tools/registry.js", import.meta.url))); }
catch { console.error("Build output not found — run `npm run build` first; the expected tool list comes from it."); process.exit(2); }
const REDIRECT = "http://localhost:6274/oauth/callback";
const RESOURCE = `${BASE}/mcp`;
const BOGUS_KEY = "el_this_is_not_a_real_key_000000";
const INIT = { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "enrich-layer-mcp-smoke", version: "0" } };
// Every secret seen so far is masked wherever it would be printed, on top of the key and JWT patterns.
const secrets = [API_KEY];
const secret = (value) => { if (value) secrets.push(String(value)); return value; };
const red = (s) => secrets.reduce((text, value) => text.replaceAll(value, "…REDACTED…"), String(s)).replace(/el_[A-Za-z0-9_-]{6,}/g, "el_…REDACTED").replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "eyJ…JWT…");
const log = (...a) => console.log(...a.map(red));
const b64url = (b) => Buffer.from(b).toString("base64url");
const t0 = Date.now();
let current = "";
const step = (n) => { current = n; log(`\n[${((Date.now()-t0)/1000).toFixed(2)}s] ${n}`); };
const check = (ok, what) => { if (!ok) { console.error(red(`\nFAIL: ${current}: ${what}`)); process.exit(1); } };
const http = (url, init = {}) => fetch(url, { signal: AbortSignal.timeout(30_000), ...init });
// Bodies are never echoed: only the OAuth error fields of an unexpected response.
const expectStatus = async (r, status) => {
  if (r.status === status) return;
  let reason = "";
  try { const body = JSON.parse(await r.text()); reason = [body.error, body.error_description].filter((v) => typeof v === "string").join(": "); } catch {}
  check(false, `expected ${status}, got ${r.status}${reason ? ` (${reason})` : ""}`);
};
const json = async (r) => { try { return JSON.parse(await r.text()); } catch { check(false, `status ${r.status}, response is not JSON`); } };
const rpc = async (r) => { const txt = await r.text(); const data = txt.split("\n").find((l) => l.startsWith("data:")); try { return JSON.parse(data ? data.slice(5) : txt); } catch { return {}; } };
const form = (body) => ({ method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body) });
const claimsOf = (jwt) => { try { return JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString()); } catch { return {}; } };
const checkClaims = (claims) => {
  check(claims.iss === BASE, `access token iss is ${JSON.stringify(claims.iss)}, expected "${BASE}"`);
  check(claims.aud === RESOURCE, `access token aud is ${JSON.stringify(claims.aud)}, expected "${RESOURCE}"`);
  check(typeof claims.api_key === "string" && claims.api_key, "access token has no api_key claim");
  check(String(claims.scope).split(" ").includes("api"), `access token scope is ${JSON.stringify(claims.scope)}, expected "api"`);
};

step("1. Dynamic client registration");
let r = await http(`${BASE}/oauth/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ redirect_uris: [REDIRECT], client_name: "enrich-layer-mcp-smoke", token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] }) });
await expectStatus(r, 201);
const reg = await json(r); secret(reg.client_secret);
log("  client_id", reg.client_id, "token_endpoint_auth_method", reg.token_endpoint_auth_method);
check(typeof reg.client_id === "string" && reg.client_id, "no client_id");
const client_id = reg.client_id;

step("2. Authorize page (PKCE S256 + resource param)");
const verifier = b64url(crypto.randomBytes(32));
const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
const state = b64url(crypto.randomBytes(12));
const authUrl = `${BASE}/authorize?` + new URLSearchParams({ client_id, redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: "S256", response_type: "code", state, scope: "api", resource: RESOURCE });
const consentSession = async () => {
  r = await http(authUrl); const html = await r.text();
  log("  status", r.status, "bytes", html.length, "title:", (html.match(/<h1[^>]*>([^<]+)<\/h1>/) || [])[1]);
  check(r.status === 200, `expected 200, got ${r.status}`);
  const m = html.match(/name="session_id"[^>]*value="([^"]+)"/) || html.match(/value="([^"]+)"[^>]*name="session_id"/);
  check(m, "no session_id on the consent page");
  return m[1];
};
const session_id = await consentSession();
const consent = (session, api_key) => http(`${BASE}/oauth/callback`, { ...form({ session_id: session, api_key }), redirect: "manual" });

step("3. Submit the consent form with the API key");
r = await consent(session_id, API_KEY);
const cb = new URL(r.headers.get("location") || "/", BASE); const code = secret(cb.searchParams.get("code"));
log("  status", r.status, "redirect", `${cb.origin}${cb.pathname}`, "code:", !!code, "state echoed:", cb.searchParams.get("state") === state);
check(r.status === 302 || r.status === 303, `expected a redirect, got ${r.status}`);
check(`${cb.origin}${cb.pathname}` === REDIRECT, `redirected to ${cb.origin}${cb.pathname}?error=${cb.searchParams.get("error")}, expected ${REDIRECT}`);
check(code, "no authorization code in the redirect");
check(cb.searchParams.get("state") === state, "state was not echoed");

step("4. Token exchange (authorization_code + PKCE + resource)");
r = await http(`${BASE}/oauth/token`, form({ grant_type: "authorization_code", code, code_verifier: verifier, client_id, redirect_uri: REDIRECT, resource: RESOURCE }));
await expectStatus(r, 200);
const tok = await json(r); secret(tok.access_token); secret(tok.refresh_token);
check(tok.access_token && tok.refresh_token, "no access or refresh token");
const claims = claimsOf(tok.access_token);
log("  JWT claims:", JSON.stringify({ ...claims, api_key: claims.api_key ? "…present…" : undefined }), " exp-iat:", claims.exp - claims.iat, "s");
checkClaims(claims);

step("5. MCP initialize with Bearer");
const mcp = (body, token = tok.access_token) => http(RESOURCE, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
r = await mcp({ jsonrpc: "2.0", id: 1, method: "initialize", params: INIT });
log("  status", r.status, "ct", r.headers.get("content-type"), "session-id header:", r.headers.get("mcp-session-id"));
await expectStatus(r, 200);
const init = await rpc(r);
log("  serverInfo", JSON.stringify(init.result?.serverInfo), "protocolVersion", init.result?.protocolVersion);
check(init.result?.serverInfo, `no serverInfo in the initialize result${init.error ? ` (${init.error.message})` : ""}`);

step("6. tools/list");
r = await mcp({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
await expectStatus(r, 200);
const tools = (await rpc(r)).result?.tools || []; const listed = new Set(tools.map((t) => t.name));
log("  tools:", tools.length, "expected:", allToolDefs.length, "missing-title:", tools.filter((t) => !t.annotations?.title).map((t) => t.name), "missing-readOnly:", tools.filter((t) => t.annotations?.readOnlyHint === undefined).map((t) => t.name));
check(tools.length === allToolDefs.length, `${tools.length} tools, expected ${allToolDefs.length} (not listed: ${allToolDefs.map((d) => d.name).filter((n) => !listed.has(n)).join(", ") || "none"})`);

step("7. tools/call enrich_credit_balance (0 credits)");
r = await mcp({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "enrich_credit_balance", arguments: {} } });
await expectStatus(r, 200);
const call = await rpc(r);
log("  result:", JSON.stringify(call.result ?? call.error).slice(0, 300));
check(call.result && !call.result.isError, `the tool call failed: ${JSON.stringify(call.error ?? call.result?.content?.[0]?.text ?? "no result").slice(0, 200)}`);

step("8. GET /mcp and DELETE /mcp with Bearer (405: stateless server)");
for (const method of ["GET", "DELETE"]) {
  r = await http(RESOURCE, { method, headers: { accept: "text/event-stream", authorization: `Bearer ${tok.access_token}` } }); await r.text();
  log(`  ${method} status`, r.status, "allow", r.headers.get("allow"));
  check(r.status === 405, `${method} /mcp answered ${r.status}, expected 405`);
}

step("9. Refresh token grant (rotation)");
r = await http(`${BASE}/oauth/token`, form({ grant_type: "refresh_token", refresh_token: tok.refresh_token, client_id, resource: RESOURCE }));
await expectStatus(r, 200);
const tok2 = await json(r); secret(tok2.access_token); secret(tok2.refresh_token);
log("  new access:", !!tok2.access_token, "new refresh:", !!tok2.refresh_token, "rotated:", tok2.refresh_token !== tok.refresh_token);
check(tok2.access_token && tok2.refresh_token, "no access or refresh token");
check(tok2.refresh_token !== tok.refresh_token, "the refresh token was not rotated");
checkClaims(claimsOf(tok2.access_token));

step("10. Reuse of the rotated-out refresh token");
r = await http(`${BASE}/oauth/token`, form({ grant_type: "refresh_token", refresh_token: tok.refresh_token, client_id }));
const reuse = await json(r); secret(reuse.access_token); secret(reuse.refresh_token);
log("  status", r.status, "error", reuse.error);
check(r.status === 400 && reuse.error === "invalid_grant", `reusing the old refresh token answered ${r.status}${reuse.error ? ` ${reuse.error}` : ""}, expected 400 invalid_grant`);

step("11. Bad API key path: the consent page refuses it");
r = await consent(await consentSession(), BOGUS_KEY);
const back = new URL(r.headers.get("location") || "/", BASE); secret(back.searchParams.get("code"));
log("  status", r.status, "redirect", `${back.origin}${back.pathname}`, "error", back.searchParams.get("error"));
check(back.searchParams.get("error") === "invalid_api_key" && !back.searchParams.has("code"), `expected a redirect back with error=invalid_api_key, got ${r.status} ${back.pathname} with error=${back.searchParams.get("error")}${back.searchParams.has("code") ? " and an authorization code" : ""}`);

step("12. Discovery: 401 challenge → path-aware protected-resource metadata");
r = await http(RESOURCE, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 4, method: "initialize", params: INIT }) }); await r.text();
const wwwAuthenticate = r.headers.get("www-authenticate") || "";
log("  unauthenticated status", r.status, "www-authenticate:", wwwAuthenticate);
check(r.status === 401, `an unauthenticated POST /mcp answered ${r.status}, expected 401`);
check(wwwAuthenticate.includes(`resource_metadata="${BASE}/.well-known/oauth-protected-resource/mcp"`), "the challenge does not name the path-aware protected-resource metadata");
r = await http(`${BASE}/.well-known/oauth-protected-resource/mcp`);
log("  GET /.well-known/oauth-protected-resource/mcp ->", r.status);
await expectStatus(r, 200);
const prm = await json(r);
log("  resource", prm.resource, "authorization_servers", JSON.stringify(prm.authorization_servers));
check(prm.resource === RESOURCE, `protected-resource metadata names resource ${JSON.stringify(prm.resource)}, expected "${RESOURCE}"`);
check(Array.isArray(prm.authorization_servers) && prm.authorization_servers.includes(BASE), `protected-resource metadata names authorization_servers ${JSON.stringify(prm.authorization_servers)}, expected "${BASE}"`);

step("13. Authorization-server metadata");
r = await http(`${BASE}/.well-known/oauth-authorization-server`);
await expectStatus(r, 200);
const asMeta = await json(r);
log("  issuer", asMeta.issuer, "S256:", !!asMeta.code_challenge_methods_supported?.includes("S256"));
check(asMeta.issuer === BASE, `issuer is ${JSON.stringify(asMeta.issuer)}, expected "${BASE}"`);
check(asMeta.code_challenge_methods_supported?.includes("S256"), "S256 is not in code_challenge_methods_supported");
check(asMeta.registration_endpoint === `${BASE}/oauth/register` && asMeta.authorization_endpoint === `${BASE}/authorize` && asMeta.token_endpoint === `${BASE}/oauth/token`, "the advertised endpoints are not the ones this flow used");

step("14. Discovery variants clients probe (200 or 404, never an error)");
for (const p of ["/.well-known/oauth-protected-resource", "/.well-known/openid-configuration", "/.well-known/oauth-authorization-server/mcp", "/mcp/.well-known/oauth-protected-resource"]) {
  r = await http(`${BASE}${p}`); await r.text();
  log(`  GET ${p} -> ${r.status}`);
  check(r.status === 200 || r.status === 404, `GET ${p} answered ${r.status}`);
}
log("\nDONE — connector smoke test passed");
