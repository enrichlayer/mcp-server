#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
import {
  createMcpSentry,
  safeErrorForLog,
} from "./sentry.js";

const sentry = createMcpSentry({ service: "enrich-layer-mcp-server-stdio" });
const transport = new StdioServerTransport();

let shuttingDown = false;
const shutdown = async (): Promise<void> => {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  process.removeListener("SIGINT", onSignal);
  process.removeListener("SIGTERM", onSignal);
  try {
    await transport.close();
  } finally {
    await sentry.shutdown();
  }
};

const onSignal = (): void => {
  void shutdown().catch((error) => {
    sentry.captureStartupFailure(error, "shutdown");
    console.error("Enrich Layer MCP stdio shutdown failed:", safeErrorForLog(error));
    process.exitCode = 1;
  });
};

process.once("SIGINT", onSignal);
process.once("SIGTERM", onSignal);

try {
  const server = createServer();
  await server.connect(transport);
} catch (error) {
  sentry.captureStartupFailure(error, "startup");
  console.error("Unable to start Enrich Layer MCP stdio server:", safeErrorForLog(error));
  await shutdown();
  process.exitCode = 1;
}
