import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createMcpSentry,
  safeErrorForLog,
} from "../build/sentry.js";

function fakeSdk() {
  const state = {
    initOptions: undefined,
    captures: [],
    flushTimeouts: [],
  };

  return {
    state,
    sdk: {
      init(options) {
        state.initOptions = options;
      },
      captureException(error, context) {
        state.captures.push({ error, context });
        return "event-id";
      },
      async flush(timeout) {
        state.flushTimeouts.push(timeout);
        return true;
      },
    },
  };
}

test("configured Sentry captures startup/request failures with scrubbed context and flushes", async () => {
  const { state, sdk } = fakeSdk();
  const dsn = "https://public@example.ingest.sentry.io/123";
  const githubToken = "glpat-very-secret-test-token";
  const bearerToken = "bearer-secret-test-token";
  const sentry = createMcpSentry({
    dsn,
    environment: "production",
    release: "mcp-0.3.0",
    service: "enrich-layer-mcp-server",
    sdk,
  });

  assert.equal(sentry.enabled, true);
  assert.equal(state.initOptions.environment, "production");
  assert.equal(state.initOptions.release, "mcp-0.3.0");
  assert.equal(state.initOptions.defaultIntegrations, false);
  assert.equal(state.initOptions.sendDefaultPii, false);
  assert.equal(state.initOptions.tracesSampleRate, 0);
  assert.deepEqual(state.initOptions.initialScope.tags, {
    service: "enrich-layer-mcp-server",
    environment: "production",
    release: "mcp-0.3.0",
  });

  sentry.captureStartupFailure(
    new Error(`failed to listen with ${githubToken}`),
    "listen",
  );
  sentry.captureRequestFailure(
    new Error(`request rejected with Bearer ${bearerToken}`),
    {
      method: "POST",
      path: `/mcp?access_token=${bearerToken}`,
      statusCode: 500,
    },
  );

  const scrubbedEvent = state.initOptions.beforeSend({
    message: `failed with ${githubToken}`,
    extra: { apiKey: githubToken },
    request: { headers: { authorization: `Bearer ${bearerToken}` } },
  });
  const captured = JSON.stringify(state.captures);
  assert.equal(captured.includes(githubToken), false);
  assert.equal(captured.includes(bearerToken), false);
  assert.equal(JSON.stringify(scrubbedEvent).includes(githubToken), false);
  assert.equal(JSON.stringify(scrubbedEvent).includes(bearerToken), false);
  assert.equal(scrubbedEvent.extra.apiKey, "[REDACTED]");
  assert.equal(state.captures[0].context.tags.operation, "startup");
  assert.equal(state.captures[1].context.tags.operation, "request");
  assert.equal(state.captures[1].context.tags.path, "/mcp");
  assert.equal(state.captures[1].context.tags.status_code, "500");

  const safeLog = safeErrorForLog(new Error(`startup ${githubToken}`));
  assert.equal(JSON.stringify(safeLog).includes(githubToken), false);

  await sentry.shutdown();
  assert.deepEqual(state.flushTimeouts, [2000]);
  assert.equal(captured.includes(dsn), false);
});

test("unconfigured Sentry is a no-op and never calls the SDK", async () => {
  const { state, sdk } = fakeSdk();
  const sentry = createMcpSentry({ dsn: "   ", sdk });

  assert.equal(sentry.enabled, false);
  sentry.captureStartupFailure(new Error("startup failure"), "startup");
  sentry.captureRequestFailure(new Error("request failure"), {
    method: "POST",
    path: "/mcp",
  });
  await sentry.shutdown();

  assert.equal(state.initOptions, undefined);
  assert.deepEqual(state.captures, []);
  assert.deepEqual(state.flushTimeouts, []);
});
