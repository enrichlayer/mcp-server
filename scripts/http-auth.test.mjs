import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import { SignJWT } from "jose";
import { startHttpServer } from "../build/http-server.js";

// The server reads its configuration from the environment each time it starts;
// node --test runs each file in its own process, so this cannot leak into the
// other test files.
process.env.AUTH_JWT_SECRET = "test-secret";
process.env.AUTH_BASE_URL = "https://auth.example.com";
process.env.MCP_BASE_URL = "https://mcp.example.com";

const noopSentry = {
  enabled: false,
  captureStartupFailure() {},
  captureRequestFailure() {},
  async flush() {
    return true;
  },
  async shutdown() {},
};

async function withServer(fn) {
  const started = await startHttpServer({ port: 0, sentry: noopSentry });
  if (!started.server.listening) {
    await once(started.server, "listening");
  }
  const address = started.server.address();
  const base = `http://127.0.0.1:${typeof address === "object" ? address.port : address}`;
  try {
    await fn(base);
  } finally {
    await started.shutdown();
  }
}

async function mint({ audience = "https://mcp.example.com/mcp", issuer = "https://auth.example.com" } = {}) {
  return new SignJWT({ api_key: "el_test_key", scope: "api" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("client-123")
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode("test-secret"));
}

const INITIALIZE = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } },
});

function mcpPost(base, token, body = INITIALIZE) {
  const headers = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  if (token) headers.authorization = `Bearer ${token}`;
  return fetch(`${base}/mcp`, { method: "POST", headers, body });
}

test("protected-resource metadata is served at the root and the path-aware well-known paths", async () => {
  await withServer(async (base) => {
    for (const path of ["/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp"]) {
      const response = await fetch(`${base}${path}`);
      assert.equal(response.status, 200, path);
      const body = await response.json();
      assert.equal(body.resource, "https://mcp.example.com/mcp");
      assert.deepEqual(body.authorization_servers, ["https://auth.example.com"]);
      assert.deepEqual(body.scopes_supported, ["api"]);
      assert.deepEqual(body.bearer_methods_supported, ["header"]);
      assert.equal(response.headers.get("x-powered-by"), null);
    }
  });
});

test("GET and DELETE on /mcp answer 405 with a JSON-RPC body and an Allow header", async () => {
  await withServer(async (base) => {
    for (const method of ["GET", "DELETE"]) {
      const response = await fetch(`${base}/mcp`, {
        method,
        headers: { accept: "text/event-stream", authorization: `Bearer ${await mint()}` },
      });
      assert.equal(response.status, 405, method);
      assert.equal(response.headers.get("allow"), "POST");
      const body = await response.json();
      assert.equal(body.jsonrpc, "2.0");
      assert.equal(body.error.code, -32000);
      assert.equal(body.id, null);
    }
  });
});

test("an unauthenticated POST gets a 401 challenge that names the path-aware metadata and the scope", async () => {
  await withServer(async (base) => {
    const response = await mcpPost(base, undefined);
    assert.equal(response.status, 401);
    const challenge = response.headers.get("www-authenticate");
    assert.match(challenge, /^Bearer /);
    assert.match(challenge, /resource_metadata="https:\/\/mcp\.example\.com\/\.well-known\/oauth-protected-resource\/mcp"/);
    assert.match(challenge, /scope="api"/);
    assert.equal(response.headers.get("x-powered-by"), null);
  });
});

test("a token minted for another resource is rejected with 401", async () => {
  await withServer(async (base) => {
    const response = await mcpPost(base, await mint({ audience: "https://evil.example/mcp" }));
    assert.equal(response.status, 401);
    const challenge = response.headers.get("www-authenticate");
    assert.match(challenge, /error="invalid_token"/);
    assert.match(challenge, /error_description="Access token was not issued for this resource server"/);
    assert.match(challenge, /resource_metadata="https:\/\/mcp\.example\.com\/\.well-known\/oauth-protected-resource\/mcp"/);
  });
});

test("a token from another issuer is rejected with 401", async () => {
  await withServer(async (base) => {
    const response = await mcpPost(base, await mint({ issuer: "https://evil.example" }));
    assert.equal(response.status, 401);
    assert.match(response.headers.get("www-authenticate"), /error="invalid_token"/);
  });
});

test("an expired token is rejected with 401, not 500, so clients refresh instead of failing", async () => {
  await withServer(async (base) => {
    const expired = await new SignJWT({ api_key: "el_test_key", scope: "api" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("client-123")
      .setIssuer("https://auth.example.com")
      .setAudience("https://mcp.example.com/mcp")
      .setIssuedAt()
      .setExpirationTime("-10s")
      .sign(new TextEncoder().encode("test-secret"));
    const response = await mcpPost(base, expired);
    assert.equal(response.status, 401);
    assert.match(response.headers.get("www-authenticate"), /error_description="Access token has expired"/);
  });
});

test("a garbage bearer token is rejected with 401, not 500", async () => {
  await withServer(async (base) => {
    const response = await mcpPost(base, "not-a-jwt");
    assert.equal(response.status, 401);
    assert.match(response.headers.get("www-authenticate"), /error_description="Access token is invalid"/);
  });
});

test("a token bound to this resource initializes an MCP session", async () => {
  await withServer(async (base) => {
    const response = await mcpPost(base, await mint());
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.match(text, /"serverInfo"/);
    assert.match(text, /"name":"enrich-layer"/);
    assert.equal(response.headers.get("x-powered-by"), null);
  });
});

test("a token bound to the bare origin is accepted too", async () => {
  await withServer(async (base) => {
    const response = await mcpPost(base, await mint({ audience: "https://mcp.example.com" }));
    assert.equal(response.status, 200);
  });
});
