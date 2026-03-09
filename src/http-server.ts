import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { createServer } from "./server.js";
import { authContext } from "./auth/context.js";
import { getApiKey, verifyAccessToken } from "./auth/verifier.js";

const AUTH_BASE_URL = process.env.AUTH_BASE_URL || "http://localhost:3001";
const MCP_BASE_URL = process.env.MCP_BASE_URL || "http://localhost:3000";

const RESOURCE_METADATA_PATH = "/.well-known/oauth-protected-resource";

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
        console.error("Error handling MCP request:", error);
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: "2.0",
            error: { code: -32603, message: "Internal server error" },
            id: null,
          });
        }
      }
    });
  },
);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", server: "enrich-layer-mcp", version: "0.2.0" });
});

const PORT = parseInt(process.env.PORT || "3000", 10);
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Enrich Layer MCP HTTP server listening on port ${PORT}`);
});
