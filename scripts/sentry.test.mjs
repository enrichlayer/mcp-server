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
  const ordinaryDsn = "https://public:secret@example.ingest.sentry.io/456";
  const githubFineGrainedToken = "github_pat_very_secret_test_token";
  const sentryAuthToken = "sntrys_very_secret_test_token";
  const genericApiKey = "api key ordinary-secret-test-key";
  const nonEyJwt =
    "headersegmentlong123.payloadsegmentlong456.signaturesegmentlong789";
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
    new Error(
      `failed to listen with ${githubToken} ${ordinaryDsn} ${githubFineGrainedToken} ${sentryAuthToken} ${genericApiKey} ${nonEyJwt}`,
    ),
    "listen",
  );
  sentry.captureRequestFailure(
    new Error(
      `request rejected with Bearer ${bearerToken} ${ordinaryDsn} ${githubFineGrainedToken} ${sentryAuthToken} ${genericApiKey} ${nonEyJwt}`,
    ),
    {
      method: "POST",
      path: `/mcp?access_token=${bearerToken}`,
      statusCode: 500,
      component: "tool:enrich_company_lookup",
    },
  );

  const scrubbedEvent = state.initOptions.beforeSend({
    message: `failed with ${githubToken} ${ordinaryDsn} ${githubFineGrainedToken} ${sentryAuthToken} ${genericApiKey} ${nonEyJwt}`,
    extra: {
      apiKey: githubToken,
      ordinaryDsn,
      githubFineGrainedToken,
      sentryAuthToken,
      genericApiKey,
      nonEyJwt,
    },
    request: { headers: { authorization: `Bearer ${bearerToken}` } },
  });
  const captured = JSON.stringify(state.captures);
  const scrubbed = JSON.stringify(scrubbedEvent);
  const safeLog = JSON.stringify(
    safeErrorForLog(
      new Error(
        `startup ${githubToken} ${ordinaryDsn} ${githubFineGrainedToken} ${sentryAuthToken} ${genericApiKey} ${nonEyJwt}`,
      ),
    ),
  );
  for (const secret of [
    githubToken,
    bearerToken,
    ordinaryDsn,
    githubFineGrainedToken,
    sentryAuthToken,
    genericApiKey,
    nonEyJwt,
  ]) {
    assert.equal(captured.includes(secret), false, `captured ${secret}`);
    assert.equal(scrubbed.includes(secret), false, `event ${secret}`);
    assert.equal(safeLog.includes(secret), false, `log ${secret}`);
  }
  assert.equal(scrubbedEvent.extra.apiKey, "[REDACTED]");
  assert.equal(state.captures[0].context.tags.operation, "startup");
  assert.equal(state.captures[1].context.tags.operation, "request");
  assert.equal(state.captures[1].context.tags.path, "/mcp");
  assert.equal(state.captures[1].context.tags.status_code, "500");
  assert.equal(state.captures[1].context.tags.component, "tool:enrich_company_lookup");

  await sentry.shutdown();
  assert.deepEqual(state.flushTimeouts, [2000]);
  assert.equal(captured.includes(dsn), false);
});

test("invalid DSN disables Sentry before SDK initialization", async () => {
  const { state, sdk } = fakeSdk();
  const sentry = createMcpSentry({
    dsn: "https://public@example.ingest.sentry.io/not-a-project",
    sdk,
  });

  assert.equal(sentry.enabled, false);
  sentry.captureStartupFailure(new Error("startup failure"), "startup");
  await sentry.shutdown();
  assert.equal(state.initOptions, undefined);
  assert.deepEqual(state.captures, []);
  assert.deepEqual(state.flushTimeouts, []);
});

test("Sentry environment overrides are honored when transports use defaults", () => {
  const previousRelease = process.env.SENTRY_RELEASE;
  const previousService = process.env.SENTRY_SERVICE;
  process.env.SENTRY_RELEASE = "release-from-environment";
  process.env.SENTRY_SERVICE = "service-from-environment";
  try {
    const { state, sdk } = fakeSdk();
    const sentry = createMcpSentry({
      dsn: "https://public@example.ingest.sentry.io/123",
      sdk,
    });

    assert.equal(sentry.enabled, true);
    assert.equal(state.initOptions.release, "release-from-environment");
    assert.deepEqual(state.initOptions.initialScope.tags, {
      service: "service-from-environment",
      environment: process.env.NODE_ENV ?? "development",
      release: "release-from-environment",
    });
  } finally {
    if (previousRelease === undefined) {
      delete process.env.SENTRY_RELEASE;
    } else {
      process.env.SENTRY_RELEASE = previousRelease;
    }
    if (previousService === undefined) {
      delete process.env.SENTRY_SERVICE;
    } else {
      process.env.SENTRY_SERVICE = previousService;
    }
  }
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
