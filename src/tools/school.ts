import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { makeRequest } from "../client.js";

export function register(server: McpServer) {
  // 18. Get School Profile
  server.tool(
    "enrich_school_profile",
    "Get structured data of a school profile from its professional network URL. Cost: 1 credit.",
    {
      url: z.string().describe("Professional network school URL"),
      use_cache: z.enum(["if-present", "if-recent"]).optional().describe("Cache freshness guarantee."),
      live_fetch: z.enum(["default", "force"]).optional().describe("Force a fresh fetch. Costs 9 extra credits when set to 'force'."),
    },
    { title: "Get School Profile", readOnlyHint: true, openWorldHint: true },
    async (params) => {
      const result = await makeRequest("/api/v2/school", params);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // 19. List Students
  server.tool(
    "enrich_student_list",
    "List students of a school. Returns profile URLs and basic info. Cost: 3 credits per student returned.",
    {
      school_url: z.string().describe("Professional network school URL"),
      boolean_search_keyword: z.string().optional().describe("Boolean search for student major (max 255 chars), e.g. 'computer OR cs'"),
      country: z.string().optional().describe("ISO3166 country code for filtering, e.g. us"),
      enrich_profiles: z.enum(["skip", "enrich"]).optional().describe("Return full profile data for each student."),
      page_size: z.string().optional().describe("Max results per call (1-9999, or 1-10 if enriched)."),
      resolve_numeric_id: z.enum(["false", "true"]).optional().describe("Enable numeric ID support."),
      sort_by: z.enum(["recently-matriculated", "recently-graduated", "none"]).optional().describe("Sorting option for results."),
      student_status: z.enum(["current", "past", "all"]).optional().describe("Filter by student status."),
    },
    { title: "List Students", readOnlyHint: true, openWorldHint: true },
    async (params) => {
      const result = await makeRequest("/api/v2/school/students/", params);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );
}
