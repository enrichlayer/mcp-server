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

export interface ToolFailureContext {
  name: string;
  path: string;
}

export type ToolFailureReporter = (
  error: unknown,
  context: ToolFailureContext,
) => void;

type ToolRequester = (
  path: string,
  params: Record<string, string | undefined>,
) => Promise<unknown>;

export const allToolDefs: ToolDef[] = [
  ...companyToolDefs,
  ...personToolDefs,
  ...contactToolDefs,
  ...schoolToolDefs,
  ...jobToolDefs,
  ...searchToolDefs,
  ...metaToolDefs,
];

export function createToolHandler(
  def: Pick<ToolDef, "name" | "path">,
  onFailure?: ToolFailureReporter,
  request: ToolRequester = makeRequest,
) {
  return async (params: Record<string, string | undefined>) => {
    try {
      const result = await request(def.path, params);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (error) {
      try {
        onFailure?.(error, { name: def.name, path: def.path });
      } catch {
        // Reporting must never change the tool failure returned to the MCP client.
      }
      throw error;
    }
  };
}

export function registerAll(server: McpServer, onFailure?: ToolFailureReporter) {
  for (const def of allToolDefs) {
    server.tool(
      def.name,
      def.description,
      def.schema,
      { title: def.title, readOnlyHint: true, openWorldHint: true },
      createToolHandler(def, onFailure),
    );
  }
}
