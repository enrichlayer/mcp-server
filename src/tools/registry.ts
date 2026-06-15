import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ZodRawShape } from "zod";
import { makeRequest } from "../client.js";
import { toolDefs as companyToolDefs } from "./company.js";
import { toolDefs as personToolDefs } from "./person.js";
import { toolDefs as contactToolDefs } from "./contact.js";
import { toolDefs as schoolToolDefs } from "./school.js";
import { toolDefs as jobToolDefs } from "./job.js";
import { toolDefs as searchToolDefs } from "./search.js";
import { toolDefs as metaToolDefs } from "./meta.js";

export interface ToolDef {
  name: string;
  title: string;
  description: string;
  /** REST endpoint the tool wraps — must exist in spec/enrichlayer-api.yaml (checked by npm run check:spec) */
  path: string;
  schema: ZodRawShape;
}

export const allToolDefs: ToolDef[] = [
  ...companyToolDefs,
  ...personToolDefs,
  ...contactToolDefs,
  ...schoolToolDefs,
  ...jobToolDefs,
  ...searchToolDefs,
  ...metaToolDefs,
];

export function registerAll(server: McpServer) {
  for (const def of allToolDefs) {
    server.tool(
      def.name,
      def.description,
      def.schema,
      { title: def.title, readOnlyHint: true, openWorldHint: true },
      async (params: Record<string, string | undefined>) => {
        const result = await makeRequest(def.path, params);
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      },
    );
  }
}
