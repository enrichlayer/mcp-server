import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { makeRequest } from "../client.js";

export function register(server: McpServer) {
  // 20. Get Job Profile
  server.tool(
    "enrich_job_profile",
    "Get structured data of a job posting from its professional network URL. Returns job title, description, company, location, and more. Cost: 2 credits.",
    {
      url: z.string().describe("Professional network job posting URL"),
    },
    { title: "Get Job Profile", readOnlyHint: true, openWorldHint: true },
    async (params) => {
      const result = await makeRequest("/api/v2/job", params);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // 21. Search Jobs
  server.tool(
    "enrich_job_search",
    "Search for job postings. Filter by company, type, experience level, location, and more. Cost: 2 credits.",
    {
      search_id: z.string().optional().describe("search_id of the company (get via Company Profile API), e.g. 2790400"),
      job_type: z.enum(["full-time", "part-time", "contract", "internship", "temporary", "volunteer", "anything"]).optional().describe("Nature of the job."),
      experience_level: z.enum(["internship", "entry_level", "associate", "mid_senior_level", "director", "anything"]).optional().describe("Experience level needed."),
      when: z.enum(["yesterday", "past-week", "past-month", "anytime"]).optional().describe("When the job was posted."),
      flexibility: z.enum(["remote", "on-site", "hybrid", "anything"]).optional().describe("Job flexibility."),
      geo_id: z.string().optional().describe("geo_id of the location to search, e.g. 92000000"),
      keyword: z.string().optional().describe("Keyword to search for, e.g. engineer"),
    },
    { title: "Search Jobs", readOnlyHint: true, openWorldHint: true },
    async (params) => {
      const result = await makeRequest("/api/v2/company/job", params);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // 22. Get Job Count
  server.tool(
    "enrich_job_count",
    "Get the number of job postings matching your criteria. Cost: 2 credits.",
    {
      search_id: z.string().optional().describe("search_id of the company, e.g. 2790400"),
      job_type: z.enum(["full-time", "part-time", "contract", "internship", "temporary", "volunteer", "anything"]).optional().describe("Nature of the job."),
      experience_level: z.enum(["internship", "entry_level", "associate", "mid_senior_level", "director", "anything"]).optional().describe("Experience level needed."),
      when: z.enum(["yesterday", "past-week", "past-month", "anytime"]).optional().describe("When the job was posted."),
      flexibility: z.enum(["remote", "on-site", "hybrid", "anything"]).optional().describe("Job flexibility."),
      geo_id: z.string().optional().describe("geo_id of the location to search, e.g. 92000000"),
      keyword: z.string().optional().describe("Keyword to search for, e.g. engineer"),
    },
    { title: "Get Job Count", readOnlyHint: true, openWorldHint: true },
    async (params) => {
      const result = await makeRequest("/api/v2/company/job/count", params);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );
}
