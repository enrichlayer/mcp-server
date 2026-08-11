import assert from "node:assert/strict";
import { once } from "node:events";
import net from "node:net";
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

  const started = await startHttpServer({ port: 0, sentry });
  await once(started.server, "listening");
  assert.equal(started.server.listening, true);

  await started.shutdown();

  assert.equal(started.server.listening, false);
  assert.deepEqual(calls, ["shutdown"]);
});

test("malformed JSON is a client parse error and is not reported to Sentry", async () => {
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
  const started = await startHttpServer({ port: 0, sentry });
  if (!started.server.listening) {
    await once(started.server, "listening");
  }
  const address = started.server.address();
  assert.notEqual(address, null);
  const port = typeof address === "object" ? address.port : address;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.deepEqual(payload, {
      jsonrpc: "2.0",
      error: { code: -32700, message: "Parse error" },
      id: null,
    });
    assert.deepEqual(calls, []);
  } finally {
    await started.shutdown();
  }
});

test("HTTP shutdown force-closes a connection that never completes its body", async () => {
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
  const started = await startHttpServer({ port: 0, sentry });
  if (!started.server.listening) {
    await once(started.server, "listening");
  }
  const address = started.server.address();
  assert.notEqual(address, null);
  const port = typeof address === "object" ? address.port : address;
  const socket = net.createConnection({ host: "127.0.0.1", port });

  try {
    await once(socket, "connect");
    socket.write(
      "POST /mcp HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: 100\r\n\r\n{",
    );
    const startedAt = Date.now();
    await started.shutdown();

    assert.ok(Date.now() - startedAt < 3_000);
    assert.equal(started.server.listening, false);
    assert.deepEqual(calls, ["shutdown"]);
  } finally {
    socket.destroy();
    if (started.server.listening) {
      await started.shutdown();
    }
  }
});

test("synchronous HTTP startup failure awaits the Sentry shutdown boundary", async () => {
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

  await assert.rejects(startHttpServer({ port: -1, sentry }));
  assert.deepEqual(calls, ["capture-startup", "shutdown"]);
});

test("asynchronous HTTP listen failure sets a failing process exit code", async () => {
  const originalExitCode = process.exitCode;
  const firstSentry = {
    enabled: true,
    captureStartupFailure() {},
    captureRequestFailure() {},
    async flush() {
      return true;
    },
    async shutdown() {},
  };
  const secondCalls = [];
  const secondSentry = {
    enabled: true,
    captureStartupFailure() {
      secondCalls.push("capture-startup");
    },
    captureRequestFailure() {},
    async flush() {
      return true;
    },
    async shutdown() {
      secondCalls.push("shutdown");
    },
  };
  const first = await startHttpServer({ port: 0, sentry: firstSentry });
  if (!first.server.listening) {
    await once(first.server, "listening");
  }
  const address = first.server.address();
  assert.notEqual(address, null);
  const port = typeof address === "object" ? address.port : address;
  const second = await startHttpServer({ port, sentry: secondSentry });

  try {
    await once(second.server, "error");
    assert.equal(process.exitCode, 1);
    assert.deepEqual(secondCalls, ["capture-startup", "shutdown"]);
  } finally {
    await first.shutdown();
    if (second.server.listening) {
      await second.shutdown();
    }
    if (originalExitCode === undefined) {
      process.exitCode = undefined;
    } else {
      process.exitCode = originalExitCode;
    }
  }
});
