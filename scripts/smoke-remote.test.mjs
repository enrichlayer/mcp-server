import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { SignJWT } from "jose";
import { allToolDefs } from "../build/tools/registry.js";

// Runs scripts/smoke-remote.mjs against a local stand-in for a deployment: the
// authorization server and the MCP server on one origin, as on
// mcp.enrichlayer.com. A correct stand-in must pass. Each fault is a breakage
// the script must fail on — the first four are the review's reproductions,
// which the script used to report as passing.
const SCRIPT = fileURLToPath(new URL("./smoke-remote.mjs", import.meta.url));
const API_KEY = "el_fake_smoke_key_0123456789";
const SIGNING_KEY = new TextEncoder().encode("fake-signing-secret");

const random = () => crypto.randomBytes(16).toString("base64url");

async function readBody(req) {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body;
}

async function startDeployment(fault = {}) {
  // Every secret the deployment hands out, to prove the script prints none.
  const issued = [];
  const accessTokens = new Set();
  const sessions = new Map();
  const codes = new Map();
  const refreshTokens = new Map();
  let base;

  const json = (res, status, payload, headers = {}) => {
    res.writeHead(status, { "content-type": "application/json", ...headers });
    res.end(JSON.stringify(payload));
  };
  const redirect = (res, location) => {
    res.writeHead(303, { location });
    res.end();
  };
  // The MCP server's stateless transport answers JSON-RPC as an SSE event.
  const rpcResult = (res, id, result) => {
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.end(`event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id, result })}\n\n`);
  };
  const protectedResource = () => ({
    resource: `${base}/mcp`,
    authorization_servers: [base],
    scopes_supported: ["api"],
    bearer_methods_supported: ["header"],
  });

  async function grant(clientId) {
    const accessToken = await new SignJWT({ api_key: API_KEY, scope: "api" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(clientId)
      .setIssuer(fault.wrongIss ? "https://evil.example" : base)
      .setAudience(fault.wrongAud ? "https://evil.example/mcp" : `${base}/mcp`)
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(SIGNING_KEY);
    const refreshToken = random();
    accessTokens.add(accessToken);
    refreshTokens.set(refreshToken, { clientId, used: false });
    issued.push(accessToken, refreshToken);
    return { access_token: accessToken, token_type: "Bearer", expires_in: 3600, scope: "api", refresh_token: refreshToken };
  }

  const server = createServer(async (req, res) => {
    try {
      await route(req, res);
    } catch (error) {
      // Surfaces a stand-in bug as a 500 the script reports, not a crash.
      json(res, 500, { error: "server_error", error_description: String(error) });
    }
  });

  async function route(req, res) {
    const url = new URL(req.url, base);
    const body = await readBody(req);
    const form = new URLSearchParams(body);
    switch (`${req.method} ${url.pathname}`) {
      case "GET /.well-known/oauth-protected-resource/mcp":
        if (fault.pathAwareMetadata404) return json(res, 404, { error: "not_found" });
        return json(res, 200, protectedResource());
      case "GET /.well-known/oauth-protected-resource":
        return json(res, 200, protectedResource());
      case "GET /.well-known/oauth-authorization-server":
        return json(res, 200, {
          issuer: base,
          authorization_endpoint: `${base}/authorize`,
          token_endpoint: `${base}/oauth/token`,
          registration_endpoint: `${base}/oauth/register`,
          response_types_supported: ["code"],
          grant_types_supported: ["authorization_code", "refresh_token"],
          code_challenge_methods_supported: ["S256"],
          token_endpoint_auth_methods_supported: ["client_secret_post", "none"],
        });
      case "POST /oauth/register": {
        const client = { client_id: random(), client_secret: random() };
        issued.push(client.client_secret);
        return json(res, 201, { ...JSON.parse(body), ...client });
      }
      case "GET /authorize": {
        const sessionId = random();
        sessions.set(sessionId, Object.fromEntries(url.searchParams));
        res.writeHead(200, { "content-type": "text/html" });
        return res.end(
          `<h1>Connect Enrich Layer</h1><form action="/oauth/callback" method="POST">` +
            `<input type="hidden" name="session_id" value="${sessionId}"><input name="api_key"></form>`,
        );
      }
      case "POST /oauth/callback": {
        const sessionId = form.get("session_id");
        const session = sessions.get(sessionId);
        if (!session) return json(res, 400, { error: "Missing session_id or api_key" });
        if (form.get("api_key") !== API_KEY && !fault.bogusKeyAccepted) {
          return redirect(res, `${base}/authorize?session_id=${sessionId}&error=invalid_api_key`);
        }
        const code = random();
        codes.set(code, session);
        issued.push(code);
        const target = new URL(session.redirect_uri);
        target.searchParams.set("code", code);
        target.searchParams.set("state", session.state);
        return redirect(res, target.href);
      }
      case "POST /oauth/token": {
        if (form.get("grant_type") === "authorization_code") {
          const session = codes.get(form.get("code"));
          codes.delete(form.get("code"));
          const challenge = crypto.createHash("sha256").update(form.get("code_verifier") ?? "").digest("base64url");
          if (!session || challenge !== session.code_challenge) return json(res, 400, { error: "invalid_grant" });
          return json(res, 200, await grant(session.client_id));
        }
        const entry = refreshTokens.get(form.get("refresh_token"));
        if (!entry || (entry.used && !fault.refreshReuseAccepted)) {
          return json(res, 400, { error: "invalid_grant", error_description: "Invalid or expired refresh token" });
        }
        entry.used = true;
        return json(res, 200, await grant(entry.clientId));
      }
      case "POST /mcp": {
        const token = (req.headers.authorization ?? "").replace(/^Bearer /, "");
        if (fault.mcpUnauthorized || !accessTokens.has(token)) {
          return json(res, 401, { error: "invalid_token", error_description: "Access token is invalid" }, {
            "www-authenticate": `Bearer error="invalid_token", error_description="Access token is invalid", scope="api", resource_metadata="${base}/.well-known/oauth-protected-resource/mcp"`,
          });
        }
        const { id, method } = JSON.parse(body);
        if (method === "initialize") {
          return rpcResult(res, id, {
            protocolVersion: "2025-06-18",
            capabilities: { tools: {} },
            serverInfo: { name: "enrich-layer", version: "0.4.0" },
          });
        }
        if (method === "tools/list") {
          const defs = fault.missingTool ? allToolDefs.slice(1) : allToolDefs;
          return rpcResult(res, id, {
            tools: defs.map((def) => ({
              name: def.name,
              description: def.description,
              inputSchema: { type: "object" },
              annotations: { title: def.title, readOnlyHint: true, openWorldHint: true },
            })),
          });
        }
        return rpcResult(res, id, { content: [{ type: "text", text: JSON.stringify({ credit_balance: 42 }) }] });
      }
      case "GET /mcp":
      case "DELETE /mcp":
        return json(res, 405, { jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null }, { allow: "POST" });
      default:
        return json(res, 404, { error: "not_found" });
    }
  }

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  base = `http://127.0.0.1:${server.address().port}`;
  return {
    base,
    issued,
    async close() {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

async function runSmoke(base, { apiKey = API_KEY } = {}) {
  const env = { ...process.env, ENRICHLAYER_API_KEY: apiKey };
  // `null` runs the script without a key — `undefined` would re-trigger the default.
  if (apiKey === null) delete env.ENRICHLAYER_API_KEY;
  const child = spawn(process.execPath, [SCRIPT, base], { env, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => (stdout += chunk));
  child.stderr.on("data", (chunk) => (stderr += chunk));
  const [code] = await once(child, "close");
  return { code, stdout, stderr };
}

async function smokeAgainst(fault) {
  const deployment = await startDeployment(fault);
  try {
    return { ...(await runSmoke(deployment.base)), issued: deployment.issued };
  } finally {
    await deployment.close();
  }
}

test("the smoke script passes against a correct deployment and prints no key, client secret, code or token", async () => {
  const { code, stdout, stderr, issued } = await smokeAgainst({});
  assert.equal(code, 0, `${stdout}\n${stderr}`);
  assert.match(stdout, /connector smoke test passed/);
  // client secret, code, access and refresh tokens, refreshed pair
  assert.ok(issued.length >= 6, `only ${issued.length} secrets issued`);
  for (const secret of [API_KEY, ...issued]) {
    assert.equal(`${stdout}${stderr}`.includes(secret), false, "the output contains a secret");
  }
});

const faults = [
  ["every POST /mcp is answered 401", { mcpUnauthorized: true }, /initialize/],
  ["the path-aware protected-resource metadata is missing", { pathAwareMetadata404: true }, /protected-resource metadata/i],
  ["a used refresh token is accepted again", { refreshReuseAccepted: true }, /refresh token/],
  ["the access token's aud names another resource", { wrongAud: true }, /\baud\b/],
  ["the access token's iss names another issuer", { wrongIss: true }, /\biss\b/],
  ["tools/list is missing a tool", { missingTool: true }, /tools\/list/],
  ["a bogus API key is accepted on the consent page", { bogusKeyAccepted: true }, /invalid_api_key/],
  [
    "the review's combined reproduction breaks all three at once",
    { mcpUnauthorized: true, pathAwareMetadata404: true, refreshReuseAccepted: true },
    /initialize/,
  ],
];

for (const [name, fault, reason] of faults) {
  test(`the smoke script exits 1 when ${name}`, async () => {
    const { code, stdout, stderr } = await smokeAgainst(fault);
    assert.equal(code, 1, `${stdout}\n${stderr}`);
    assert.match(stderr, /FAIL: /);
    assert.match(stderr, reason);
    assert.doesNotMatch(stdout, /connector smoke test passed/);
  });
}

test("the smoke script exits 2 without ENRICHLAYER_API_KEY", async () => {
  // Nothing listens on the discard port: the script must stop before any request.
  const { code, stderr } = await runSmoke("http://127.0.0.1:9", { apiKey: null });
  assert.equal(code, 2);
  assert.match(stderr, /ENRICHLAYER_API_KEY/);
});
