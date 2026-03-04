import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { makeRequest } from "../client.js";

export function register(server: McpServer) {
  // 25. Get Credit Balance
  server.tool(
    "enrich_credit_balance",
    "View your current Enrich Layer credit balance. Cost: 0 credits.",
    {},
    { title: "Check Credit Balance", readOnlyHint: true, openWorldHint: true },
    async () => {
      const result = await makeRequest("/api/v2/credit-balance", {});
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );
}
