import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import { startHttpServer } from "../build/http-server.js";

test("HTTP server shutdown invokes the Sentry flush boundary", async () => {
  const calls = [];
  const sentry = {
    enabled: true,
    captureStartupFailure() {
      calls.push("capture-startup");
    },
    captureRequestFailure() {
      calls.push("capture-request");
    },
    async flush() {
      calls.push("flush");
      return true;
    },
    async shutdown() {
      calls.push("shutdown");
    },
  };

  const started = startHttpServer({ port: 0, sentry });
  await once(started.server, "listening");
  assert.equal(started.server.listening, true);

  await started.shutdown();

  assert.equal(started.server.listening, false);
  assert.deepEqual(calls, ["shutdown"]);
});
