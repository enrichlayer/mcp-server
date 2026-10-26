import assert from "node:assert/strict";
import { test } from "node:test";
import { SignJWT } from "jose";
import { InvalidTokenError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import { createVerifier, verifierConfigFromEnv } from "../build/auth/verifier.js";
import {
  canonicalizeResource,
  expectedAudiences,
  resourceIdentifier,
} from "../build/auth/resource.js";

const SECRET = "test-secret";
const ISSUER = "https://mcp.example.com";
const AUDIENCES = ["https://mcp.example.com/mcp", "https://mcp.example.com"];

function verifier(overrides = {}) {
  return createVerifier({ secret: SECRET, issuer: ISSUER, audiences: AUDIENCES, ...overrides });
}

async function mint({
  secret = SECRET,
  issuer = ISSUER,
  audience = AUDIENCES[0],
  subject = "client-123",
  claims = { api_key: "el_test_key", scope: "api" },
  expiresIn = "1h",
} = {}) {
  let jwt = new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(subject)
    .setIssuedAt()
    .setExpirationTime(expiresIn);
  // `null` means "leave the claim out" — an explicit `undefined` would just
  // re-trigger the destructuring default above.
  if (issuer !== null) jwt = jwt.setIssuer(issuer);
  if (audience !== null) jwt = jwt.setAudience(audience);
  return jwt.sign(new TextEncoder().encode(secret));
}

test("canonicalizeResource lowercases, drops default ports, fragments are rejected, trailing slashes stripped", () => {
  assert.equal(canonicalizeResource("https://MCP.Example.com:443/mcp/"), "https://mcp.example.com/mcp");
  assert.equal(canonicalizeResource("https://mcp.example.com/"), "https://mcp.example.com");
  assert.equal(canonicalizeResource("https://mcp.example.com"), "https://mcp.example.com");
  assert.equal(canonicalizeResource("https://mcp.example.com:8443/server/mcp"), "https://mcp.example.com:8443/server/mcp");
  assert.throws(() => canonicalizeResource("https://mcp.example.com#fragment"), /fragment/);
  assert.throws(() => canonicalizeResource("mcp.example.com"));
});

test("expectedAudiences lists the /mcp endpoint first, then the origin", () => {
  assert.deepEqual(expectedAudiences("https://MCP.example.com/"), AUDIENCES);
  assert.equal(resourceIdentifier("https://mcp.example.com"), "https://mcp.example.com/mcp");
});

test("accepts a token bound to the /mcp resource and exposes the api key", async () => {
  const token = await mint();
  const auth = await verifier()(token);
  assert.equal(auth.clientId, "client-123");
  assert.deepEqual(auth.scopes, ["api"]);
  assert.equal(auth.extra.api_key, "el_test_key");
  assert.equal(auth.token, token);
  assert.equal(typeof auth.expiresAt, "number");
});

test("accepts a token bound to the bare origin", async () => {
  const auth = await verifier()(await mint({ audience: AUDIENCES[1] }));
  assert.equal(auth.clientId, "client-123");
});

test("accepts an array audience containing an allowed value", async () => {
  const auth = await verifier()(await mint({ audience: ["https://other.example", AUDIENCES[0]] }));
  assert.equal(auth.clientId, "client-123");
});

test("rejects a token without an audience with an InvalidTokenError (401 at the middleware)", async () => {
  await assert.rejects(verifier()(await mint({ audience: null })), (error) => {
    assert.ok(error instanceof InvalidTokenError);
    assert.equal(error.errorCode, "invalid_token");
    assert.match(error.message, /not issued for this resource server/);
    assert.doesNotMatch(error.message, /"/);
    return true;
  });
});

test("rejects a token minted for another resource", async () => {
  await assert.rejects(verifier()(await mint({ audience: "https://evil.example/mcp" })), /not issued for this resource server/);
});

test("rejects a token from another issuer", async () => {
  await assert.rejects(verifier()(await mint({ issuer: "https://evil.example" })), /not issued for this resource server/);
});

test("rejects a token without an issuer", async () => {
  await assert.rejects(verifier()(await mint({ issuer: null })), /not issued for this resource server/);
});

test("rejects an expired token", async () => {
  await assert.rejects(verifier()(await mint({ expiresIn: "-10s" })), (error) => {
    assert.ok(error instanceof InvalidTokenError);
    assert.match(error.message, /expired/);
    return true;
  });
});

test("rejects a token signed with a different secret", async () => {
  await assert.rejects(verifier()(await mint({ secret: "other-secret" })), (error) => {
    assert.ok(error instanceof InvalidTokenError);
    assert.equal(error.message, "Access token is invalid");
    return true;
  });
});

test("rejects a token without an api_key claim", async () => {
  await assert.rejects(verifier()(await mint({ claims: { scope: "api" } })), (error) => {
    assert.ok(error instanceof InvalidTokenError);
    assert.match(error.message, /api_key/);
    return true;
  });
});

test("rejects a token without a subject", async () => {
  const token = await new SignJWT({ api_key: "el_test_key", scope: "api" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCES[0])
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(SECRET));
  await assert.rejects(verifier()(token), (error) => {
    assert.ok(error instanceof InvalidTokenError);
    assert.match(error.message, /sub claim/);
    return true;
  });
});

test("verifierConfigFromEnv refuses a missing or empty AUTH_JWT_SECRET", () => {
  assert.throws(() => verifierConfigFromEnv({}), /AUTH_JWT_SECRET/);
  assert.throws(() => verifierConfigFromEnv({ AUTH_JWT_SECRET: "" }), /AUTH_JWT_SECRET/);
});

test("a fault that is not a jose error is logged and propagates instead of becoming a 401", async (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  const error = t.mock.method(console, "error", () => {});
  // A zero-length HMAC key makes WebCrypto throw a DOMException, not a jose
  // error: the token is not the problem, so the client must not be sent back
  // through OAuth.
  await assert.rejects(verifier({ secret: "" })(await mint()), (thrown) => {
    assert.ok(!(thrown instanceof InvalidTokenError));
    return true;
  });
  assert.equal(error.mock.callCount(), 1);
  assert.equal(warn.mock.callCount(), 0);
});

test("each rejection logs one line with jose's code and claim, never the token or the key", async (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  const token = await mint({ audience: null });
  await assert.rejects(verifier()(token), InvalidTokenError);
  assert.equal(warn.mock.callCount(), 1);
  const line = warn.mock.calls[0].arguments.join(" ");
  assert.match(line, /ERR_JWT_CLAIM_VALIDATION_FAILED/);
  assert.match(line, /claim=aud/);
  assert.match(line, /reason=missing/);
  assert.doesNotMatch(line, /\n/);
  for (const secret of [token, "el_test_key", SECRET]) {
    assert.equal(line.includes(secret), false, `logged ${secret}`);
  }
});

test("a rejection by the claim checks after jose logs one line too", async (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  const token = await mint({ claims: { scope: "api" } });
  await assert.rejects(verifier()(token), InvalidTokenError);
  assert.equal(warn.mock.callCount(), 1);
  const line = warn.mock.calls[0].arguments.join(" ");
  assert.match(line, /api_key claim/);
  assert.equal(line.includes(token), false);
});
