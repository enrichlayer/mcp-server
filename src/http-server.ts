import { createRequire } from "node:module";
import type { Server } from "node:http";
import { pathToFileURL } from "node:url";
import type { Express, NextFunction, Request, Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { createServer } from "./server.js";
import { authContext } from "./auth/context.js";
import { getApiKey, verifyAccessToken } from "./auth/verifier.js";
import {
  createMcpSentry,
  safeErrorForLog,
  type McpSentry,
} from "./sentry.js";

const { version } = createRequire(import.meta.url)("../package.json") as {
  version: string;
};

const AUTH_BASE_URL = process.env.AUTH_BASE_URL || "http://localhost:3001";
const MCP_BASE_URL = process.env.MCP_BASE_URL || "http://localhost:3000";
const RESOURCE_METADATA_PATH = "/.well-known/oauth-protected-resource";

export function createHttpApp(sentry: McpSentry): Express {
  const app = createMcpExpressApp({ host: "0.0.0.0" });

  app.get(RESOURCE_METADATA_PATH, (_req, res) => {
    res.json({
      resource: MCP_BASE_URL,
      authorization_servers: [AUTH_BASE_URL],
      scopes_supported: ["api"],
      resource_name: "Enrich Layer MCP Server",
      resource_documentation: "https://enrichlayer.com/docs",
    });
  });

  app.post(
    "/mcp",
    requireBearerAuth({
      verifier: { verifyAccessToken },
      requiredScopes: ["api"],
      resourceMetadataUrl: `${MCP_BASE_URL}${RESOURCE_METADATA_PATH}`,
    }),
    async (req, res) => {
      try {
        const apiKey = getApiKey(req.auth!);
        await authContext.run({ apiKey }, async () => {
          try {
            const server = createServer();
            const transport = new StreamableHTTPServerTransport({
              sessionIdGenerator: undefined, // stateless mode
            });
            await server.connect(transport);
            await transport.handleRequest(req, res, req.body);
          } catch (error) {
            sentry.captureRequestFailure(error, {
              method: req.method,
              path: req.path,
              statusCode: 500,
            });
            console.error("Error handling MCP request:", safeErrorForLog(error));
            if (!res.headersSent) {
              res.status(500).json({
                jsonrpc: "2.0",
                error: { code: -32603, message: "Internal server error" },
                id: null,
              });
            }
          }
        });
      } catch (error) {
        sentry.captureRequestFailure(error, {
          method: req.method,
          path: req.path,
          statusCode: 500,
        });
        console.error("Error preparing MCP request:", safeErrorForLog(error));
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: "2.0",
            error: { code: -32603, message: "Internal server error" },
            id: null,
          });
        }
      }
    },
  );

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", server: "enrich-layer-mcp", version });
  });

  app.use(
    (
      error: unknown,
      req: Request,
      res: Response,
      _next: NextFunction,
    ) => {
      sentry.captureRequestFailure(error, {
        method: req.method,
        path: req.path,
        statusCode: 500,
      });
      console.error("Unhandled MCP request error:", safeErrorForLog(error));
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    },
  );

  return app;
}

export interface HttpServerOptions {
  port?: number;
  sentry?: McpSentry;
}

export interface StartedHttpServer {
  server: Server;
  sentry: McpSentry;
  shutdown(): Promise<void>;
}

export function startHttpServer(options: HttpServerOptions = {}): StartedHttpServer {
  const sentry = options.sentry ?? createMcpSentry({ release: version });
  const port = options.port ?? parseInt(process.env.PORT || "3000", 10);

  let server: Server;
  try {
    const app = createHttpApp(sentry);
    server = app.listen(port, "0.0.0.0", () => {
      console.log(`Enrich Layer MCP HTTP server listening on port ${port}`);
    });
  } catch (error) {
    sentry.captureStartupFailure(error, "startup");
    console.error("Unable to start Enrich Layer MCP HTTP server:", safeErrorForLog(error));
    void sentry.flush();
    throw error;
  }

  server.once("error", (error) => {
    sentry.captureStartupFailure(error, "listen");
    console.error("Enrich Layer MCP HTTP server failed:", safeErrorForLog(error));
    void sentry.flush();
    process.exitCode = 1;
  });

  let shuttingDown = false;
  const onSignal = (): void => {
    void shutdown().catch((error) => {
      sentry.captureStartupFailure(error, "shutdown");
      console.error("Enrich Layer MCP HTTP server shutdown failed:", safeErrorForLog(error));
      process.exitCode = 1;
    });
  };

  const shutdown = async (): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);

    if (server.listening) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
    await sentry.shutdown();
  };

  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);

  return { server, sentry, shutdown };
}

const isMainModule =
  process.argv[1] !== undefined &&
  pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMainModule) {
  try {
    startHttpServer();
  } catch {
    process.exitCode = 1;
  }
}
