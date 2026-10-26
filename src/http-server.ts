import { createRequire } from "node:module";
import type { Server } from "node:http";
import { pathToFileURL } from "node:url";
import type { Express, NextFunction, Request, Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { createServer } from "./server.js";
import { authContext } from "./auth/context.js";
import {
  createVerifier,
  getApiKey,
  verifierConfigFromEnv,
} from "./auth/verifier.js";
import { MCP_PATH, resourceIdentifier } from "./auth/resource.js";
import {
  createMcpSentry,
  safeErrorForLog,
  type McpSentry,
} from "./sentry.js";

const { version } = createRequire(import.meta.url)("../package.json") as {
  version: string;
};

const RESOURCE_METADATA_PATH = "/.well-known/oauth-protected-resource";
const HTTP_SHUTDOWN_TIMEOUT_MS = 2_000;

interface HttpErrorLike {
  status?: unknown;
  statusCode?: unknown;
  type?: unknown;
}

function errorStatus(error: unknown): number {
  if (!error || typeof error !== "object") {
    return 500;
  }
  const candidate = error as HttpErrorLike;
  if (typeof candidate.status === "number") {
    return candidate.status;
  }
  if (typeof candidate.statusCode === "number") {
    return candidate.statusCode;
  }
  return 500;
}

function isMalformedJson(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      (error as HttpErrorLike).type === "entity.parse.failed",
  );
}

export function createHttpApp(sentry: McpSentry): Express {
  // Configuration is read here, not at import, so a missing AUTH_JWT_SECRET or
  // a malformed URL is a startup failure that startHttpServer reports.
  const verifyAccessToken = createVerifier(verifierConfigFromEnv());
  const authBaseUrl = process.env.AUTH_BASE_URL || "http://localhost:3001";
  const mcpBaseUrl = process.env.MCP_BASE_URL || "http://localhost:3000";
  // RFC 9728 §3.1: the path-suffixed document is the one clients try first when
  // the MCP endpoint has a path component, so the 401 challenge points there.
  const resourceMetadataUrl = `${mcpBaseUrl}${RESOURCE_METADATA_PATH}${MCP_PATH}`;

  const app = createMcpExpressApp({ host: "0.0.0.0" });
  app.disable("x-powered-by");

  const protectedResourceMetadata = {
    // What a user types into Claude — the canonical RFC 8707 identifier the
    // authorization server binds tokens to (see auth/resource.ts).
    resource: resourceIdentifier(mcpBaseUrl),
    authorization_servers: [authBaseUrl],
    scopes_supported: ["api"],
    bearer_methods_supported: ["header"],
    resource_name: "Enrich Layer MCP Server",
    resource_documentation: "https://enrichlayer.com/integrations/mcp",
  };
  // RFC 9728 §3.1: clients try the path-suffixed document first when the MCP
  // endpoint has a path component, then the root — serve the same JSON at both.
  app.get(
    [RESOURCE_METADATA_PATH, `${RESOURCE_METADATA_PATH}${MCP_PATH}`],
    (_req, res) => {
      res.json(protectedResourceMetadata);
    },
  );

  app.post(
    MCP_PATH,
    requireBearerAuth({
      verifier: { verifyAccessToken },
      requiredScopes: ["api"],
      resourceMetadataUrl,
    }),
    async (req, res) => {
      try {
        const apiKey = getApiKey(req.auth!);
        await authContext.run({ apiKey }, async () => {
          try {
            const server = createServer({
              onToolFailure: (error, tool) => {
                sentry.captureRequestFailure(error, {
                  method: req.method,
                  path: req.path,
                  component: `tool:${tool.name}`,
                });
              },
            });
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

  // Stateless Streamable HTTP: no server-initiated stream (GET) and no session
  // to terminate (DELETE). Answer 405 + JSON instead of Express's HTML 404 so
  // MCP clients get a protocol-shaped response.
  app.all(MCP_PATH, (_req, res) => {
    res.status(405).set("Allow", "POST").json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed. This MCP server accepts POST only.",
      },
      id: null,
    });
  });

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
      const status = errorStatus(error);
      if (status >= 400 && status < 500) {
        if (!res.headersSent) {
          res.status(status).json({
            jsonrpc: "2.0",
            error: {
              code: isMalformedJson(error) ? -32700 : -32600,
              message: isMalformedJson(error) ? "Parse error" : "Invalid request",
            },
            id: null,
          });
        }
        return;
      }
      sentry.captureRequestFailure(error, {
        method: req.method,
        path: req.path,
        statusCode: status,
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

export async function startHttpServer(
  options: HttpServerOptions = {},
): Promise<StartedHttpServer> {
  const sentry = options.sentry ?? createMcpSentry();
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
    await sentry.shutdown();
    throw error;
  }

  let shuttingDown = false;
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);

    if (server.listening) {
      await new Promise<void>((resolve) => {
        let resolved = false;
        const finish = (): void => {
          if (resolved) {
            return;
          }
          resolved = true;
          clearTimeout(forceCloseTimer);
          resolve();
        };
        const forceCloseTimer = setTimeout(() => {
          server.closeIdleConnections?.();
          server.closeAllConnections?.();
          finish();
        }, HTTP_SHUTDOWN_TIMEOUT_MS);
        server.close(() => finish());
      });
    }
    await sentry.shutdown();
  };

  const onSignal = (): void => {
    void shutdown().catch((error) => {
      sentry.captureStartupFailure(error, "shutdown");
      console.error("Enrich Layer MCP HTTP server shutdown failed:", safeErrorForLog(error));
      process.exitCode = 1;
    });
  };

  server.once("error", (error) => {
    sentry.captureStartupFailure(error, "listen");
    console.error("Enrich Layer MCP HTTP server failed:", safeErrorForLog(error));
    process.exitCode = 1;
    void shutdown().catch((shutdownError) => {
      sentry.captureStartupFailure(shutdownError, "shutdown");
      console.error(
        "Enrich Layer MCP HTTP server shutdown failed:",
        safeErrorForLog(shutdownError),
      );
      process.exitCode = 1;
    });
  });

  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);

  return { server, sentry, shutdown };
}

const isMainModule =
  process.argv[1] !== undefined &&
  pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMainModule) {
  try {
    await startHttpServer();
  } catch {
    process.exitCode = 1;
  }
}
