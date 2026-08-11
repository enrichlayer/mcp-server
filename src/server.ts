import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAll, type ToolFailureReporter } from "./tools/registry.js";

const { version } = createRequire(import.meta.url)("../package.json") as { version: string };

export interface ServerOptions {
  onToolFailure?: ToolFailureReporter;
}

export function createServer(options: ServerOptions = {}): McpServer {
  const server = new McpServer({
    name: "enrich-layer",
    version,
  });

  registerAll(server, options.onToolFailure);

  return server;
}
