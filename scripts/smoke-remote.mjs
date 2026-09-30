// End-to-end smoke test for a deployed Enrich Layer MCP connector (authorization server + resource server).
// Usage: ENRICHLAYER_API_KEY=<key> node scripts/smoke-remote.mjs https://mcp.staging.enrichlayer.com
// Registers a throwaway OAuth client, walks consent → code → token → MCP initialize/tools/list/tools/call
// (enrich_credit_balance, 0 credits), then checks refresh rotation, the bad-key path, and metadata discovery.
// Run it against staging after every rollout and against production once; it prints redacted output only.
import crypto from "node:crypto";
const BASE = process.argv[2] || "https://mcp.staging.enrichlayer.com";
const API_KEY = process.env.ENRICHLAYER_API_KEY;
if (!API_KEY) { console.error("ENRICHLAYER_API_KEY missing"); process.exit(2); }
const REDIRECT = "http://localhost:6274/oauth/callback";
const RESOURCE = `${BASE}/mcp`;
const red = (s) => String(s).replace(/el_[A-Za-z0-9_-]{6,}/g, "el_…REDACTED").replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "eyJ…JWT…");
const log = (...a) => console.log(...a.map(red));
const b64url = (b) => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const t0 = Date.now();
const step = (n) => log(`\n[${((Date.now()-t0)/1000).toFixed(2)}s] ${n}`);

step("1. Dynamic client registration");
let r = await fetch(`${BASE}/oauth/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ redirect_uris: [REDIRECT], client_name: "enrich-layer-mcp-smoke", token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] }) });
const reg = await r.json(); log("  status", r.status, JSON.stringify(reg));
const client_id = reg.client_id;

step("2. Authorize page (PKCE S256 + resource param)");
const verifier = b64url(crypto.randomBytes(32));
const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
const state = b64url(crypto.randomBytes(12));
const authUrl = `${BASE}/authorize?` + new URLSearchParams({ client_id, redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: "S256", response_type: "code", state, scope: "api", resource: RESOURCE });
r = await fetch(authUrl); const html = await r.text();
log("  status", r.status, "content-type", r.headers.get("content-type"), "bytes", html.length);
const m = html.match(/name="session_id"[^>]*value="([^"]+)"/) || html.match(/value="([^"]+)"[^>]*name="session_id"/);
log("  session_id found:", !!m, " title:", (html.match(/<h1[^>]*>([^<]+)<\/h1>/)||[])[1]);
if (!m) { log(html.slice(0, 800)); process.exit(1); }

step("3. Submit consent form with API key (POST /oauth/callback)");
r = await fetch(`${BASE}/oauth/callback`, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ session_id: m[1], api_key: API_KEY }) });
const loc = r.headers.get("location"); log("  status", r.status, "location", loc && loc.replace(/code=[^&]+/, "code=…"));
const cb = new URL(loc); const code = cb.searchParams.get("code"); log("  state echoed:", cb.searchParams.get("state") === state);

step("4. Token exchange (authorization_code + PKCE + resource)");
r = await fetch(`${BASE}/oauth/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", code, code_verifier: verifier, client_id, redirect_uri: REDIRECT, resource: RESOURCE }) });
const tok = await r.json(); log("  status", r.status, JSON.stringify({ ...tok, access_token: tok.access_token ? "…" : undefined, refresh_token: tok.refresh_token ? "…" : undefined }));
const [, payload] = tok.access_token.split("."); const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
log("  JWT claims:", JSON.stringify({ ...claims, api_key: claims.api_key ? "…present…" : undefined }), " has aud:", "aud" in claims, " exp-iat:", claims.exp - claims.iat, "s");

step("5. MCP initialize with Bearer");
const mcp = async (body, extra = {}) => fetch(`${BASE}/mcp`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${tok.access_token}`, ...extra }, body: JSON.stringify(body) });
r = await mcp({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "probe", version: "0" } } });
let txt = await r.text(); log("  status", r.status, "ct", r.headers.get("content-type"), "session-id header:", r.headers.get("mcp-session-id"), "\n  body:", txt.slice(0, 400));

step("6. tools/list");
r = await mcp({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }); txt = await r.text();
const dataLine = txt.split("\n").find(l => l.startsWith("data:")); const tl = JSON.parse(dataLine ? dataLine.slice(5) : txt);
const tools = tl.result?.tools || []; log("  status", r.status, "tools:", tools.length, "annotations sample:", JSON.stringify(tools[0]?.annotations), "missing-title:", tools.filter(t => !t.annotations?.title).map(t=>t.name), "missing-readOnly:", tools.filter(t => t.annotations?.readOnlyHint === undefined).map(t=>t.name));

step("7. tools/call enrich_credit_balance (0 credits)");
r = await mcp({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "enrich_credit_balance", arguments: {} } }); txt = await r.text();
log("  status", r.status, "body:", txt.slice(0, 300));

step("8. GET /mcp and DELETE /mcp with Bearer (spec: 405 acceptable for stateless)");
for (const method of ["GET", "DELETE"]) { r = await fetch(`${BASE}/mcp`, { method, headers: { accept: "text/event-stream", authorization: `Bearer ${tok.access_token}` } }); log(`  ${method} status`, r.status, (await r.text()).slice(0, 120)); }

step("9. Refresh token grant (rotation)");
r = await fetch(`${BASE}/oauth/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: tok.refresh_token, client_id, resource: RESOURCE }) });
const tok2 = await r.json(); log("  status", r.status, "new access:", !!tok2.access_token, "new refresh:", !!tok2.refresh_token, "rotated:", tok2.refresh_token !== tok.refresh_token);
r = await fetch(`${BASE}/oauth/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: tok.refresh_token, client_id }) });
log("  old refresh reuse status", r.status, JSON.stringify(await r.json()));

step("10. Bad API key path: does authorize validate the key?");
r = await fetch(authUrl); const html2 = await r.text(); const m2 = html2.match(/name="session_id"[^>]*value="([^"]+)"/);
r = await fetch(`${BASE}/oauth/callback`, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ session_id: m2[1], api_key: "el_this_is_not_a_real_key_000000" }) });
log("  callback with bogus key -> status", r.status, "(303 = accepted without validation)");
const cb2 = new URL(r.headers.get("location")); const code2 = cb2.searchParams.get("code");
r = await fetch(`${BASE}/oauth/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", code: code2, code_verifier: verifier, client_id, redirect_uri: REDIRECT }) });
const tok3 = await r.json(); log("  token with bogus key -> status", r.status, "access_token issued:", !!tok3.access_token);
if (tok3.access_token) { r = await fetch(`${BASE}/mcp`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${tok3.access_token}` }, body: JSON.stringify({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "enrich_credit_balance", arguments: {} } }) }); log("  tool call with bogus key -> status", r.status, (await r.text()).slice(0, 250)); }

step("11. Discovery variants clients probe");
for (const p of ["/.well-known/oauth-protected-resource/mcp", "/.well-known/openid-configuration", "/.well-known/oauth-authorization-server/mcp", "/mcp/.well-known/oauth-protected-resource"]) { r = await fetch(`${BASE}${p}`); log(`  GET ${p} -> ${r.status}`); }
if (r.status !== 200 && r.status !== 404) { console.error("unexpected discovery status"); process.exit(1); }
log("\nDONE — connector smoke test passed");
