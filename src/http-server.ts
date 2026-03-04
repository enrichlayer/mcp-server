import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { createServer } from "./server.js";

// TODO(dimitri): Add OAuth 2.0 middleware here for remote directory submission.
// See: https://support.claude.com/en/articles/12922490-remote-mcp-server-submission-guide
// Required callback URLs:
//   - http://localhost:6274/oauth/callback
//   - https://claude.ai/api/mcp/auth_callback
//   - https://claude.com/api/mcp/auth_callback

const app = createMcpExpressApp({ host: "0.0.0.0" });

app.post("/mcp", async (req, res) => {
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

app.get("/health", (_req, res) => {
  res.json({ status: "ok", server: "enrich-layer-mcp", version: "0.2.0" });
});

const PORT = parseInt(process.env.PORT || "3000", 10);
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Enrich Layer MCP HTTP server listening on port ${PORT}`);
});
