import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { makeRequest } from "../client.js";

export function register(server: McpServer) {
  // 1. Get Company Profile
  server.tool(
    "enrich_company_profile",
    "Get structured data of a company profile from its professional network URL. Returns company details including name, industry, size, description, specialties, and more. Cost: 1 credit.",
    {
      url: z.string().describe("Professional network company profile URL"),
      categories: z.enum(["exclude", "include"]).optional().describe("Append categories data. Costs 1 extra credit if included."),
      funding_data: z.enum(["exclude", "include"]).optional().describe("Returns funding rounds. Costs 1 extra credit if included."),
      exit_data: z.enum(["exclude", "include"]).optional().describe("Returns investment portfolio exits. Costs 1 extra credit if included."),
      acquisitions: z.enum(["exclude", "include"]).optional().describe("Enriched acquisition data. Costs 1 extra credit if included."),
      extra: z.enum(["exclude", "include"]).optional().describe("Extra details (ranking, contact email, phone, social accounts, funding, IPO status). Costs 1 extra credit."),
      use_cache: z.enum(["if-present", "if-recent"]).optional().describe("Cache policy: 'if-present' uses cache regardless of age, 'if-recent' returns profile no older than 29 days."),
    },
    { title: "Get Company Profile", readOnlyHint: true, openWorldHint: true },
    async (params) => {
      const result = await makeRequest("/api/v2/company", params);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // 2. Lookup Company
  server.tool(
    "enrich_company_lookup",
    "Look up a company by name or domain to find its professional network URL. Provide at least one of company_name or company_domain. Cost: 2 credits.",
    {
      company_name: z.string().optional().describe("Company name, e.g. Accenture"),
      company_domain: z.string().optional().describe("Company website or domain, e.g. accenture.com"),
      company_location: z.string().optional().describe("ISO 3166-1 alpha-2 country code, e.g. sg"),
      enrich_profile: z.enum(["skip", "enrich"]).optional().describe("Enrich result with cached profile data."),
    },
    { title: "Lookup Company", readOnlyHint: true, openWorldHint: true },
    async (params) => {
      const result = await makeRequest("/api/v2/company/resolve", params);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // 3. Lookup Company by ID
  server.tool(
    "enrich_company_id_lookup",
    "Look up a company by its internal numeric ID to get its professional network URL. Cost: 0 credits.",
    {
      id: z.string().describe("Company's internal numeric ID, e.g. 1441"),
    },
    { title: "Lookup Company by ID", readOnlyHint: true, openWorldHint: true },
    async (params) => {
      const result = await makeRequest("/api/v2/company/resolve-id", params);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // 4. Get Company Profile Picture
  server.tool(
    "enrich_company_picture",
    "Get the profile picture URL of a company. Cost: 0 credits.",
    {
      company_profile_url: z.string().describe("Professional network company profile URL"),
    },
    { title: "Get Company Picture", readOnlyHint: true, openWorldHint: true },
    async (params) => {
      const result = await makeRequest("/api/v2/company/profile-picture", params);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // 5. List Employees
  server.tool(
    "enrich_employee_list",
    "List employees of a company. Returns profile URLs and basic info. Cost: 3 credits per employee returned.",
    {
      url: z.string().describe("Professional network company URL"),
      boolean_role_search: z.string().optional().describe("Boolean search expression for job titles (max 255 chars), e.g. 'founder OR co-founder'"),
      coy_name_match: z.enum(["include", "exclude"]).optional().describe("Include profiles matching company name."),
      country: z.string().optional().describe("ISO3166 country code(s), comma separated, e.g. us"),
      employment_status: z.enum(["current", "past", "all"]).optional().describe("Filter by employment status."),
      enrich_profiles: z.enum(["skip", "enrich"]).optional().describe("Return full profile data for each employee."),
      page_size: z.string().optional().describe("Max results per call (1-9999, or 1-10 if enriched)."),
      resolve_numeric_id: z.enum(["false", "true"]).optional().describe("Enable numeric ID support for the company URL."),
      sort_by: z.enum(["recently-joined", "recently-left", "oldest", "none"]).optional().describe("Sorting option for results."),
      use_cache: z.enum(["if-present", "if-recent"]).optional().describe("Cache freshness guarantee."),
    },
    { title: "List Employees", readOnlyHint: true, openWorldHint: true },
    async (params) => {
      const result = await makeRequest("/api/v2/company/employees/", params);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // 6. Get Employee Count
  server.tool(
    "enrich_employee_count",
    "Get the number of employees at a company. Cost: 1 credit.",
    {
      url: z.string().describe("Professional network company URL"),
      at_date: z.string().optional().describe("ISO8601 date (YYYY-MM-DD) for historical count, e.g. 2023-12-31"),
      coy_name_match: z.enum(["include", "exclude"]).optional().describe("Include profiles matching company name."),
      employment_status: z.enum(["current", "past", "all"]).optional().describe("Filter by employment status."),
      estimated_employee_count: z.enum(["include", "exclude"]).optional().describe("Include estimated count from profile."),
      use_cache: z.enum(["if-present", "if-recent"]).optional().describe("Cache freshness guarantee."),
    },
    { title: "Get Employee Count", readOnlyHint: true, openWorldHint: true },
    async (params) => {
      const result = await makeRequest("/api/v2/company/employees/count", params);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // 7. Search Employees
  server.tool(
    "enrich_employee_search",
    "Search employees by keyword at a specific company. Uses boolean search syntax for job titles. Cost: 10 credits per request.",
    {
      company_profile_url: z.string().describe("Professional network company URL"),
      keyword_boolean: z.string().describe("Job title keyword in Boolean Search Syntax (max 255 chars), e.g. 'ceo OR cto'"),
      country: z.string().optional().describe("ISO3166 country code for filtering, e.g. us"),
      enrich_profiles: z.enum(["skip", "enrich"]).optional().describe("Return full profile data for each result."),
      page_size: z.string().optional().describe("Max results per call (1-9999, or 1-10 if enriched)."),
      resolve_numeric_id: z.enum(["false", "true"]).optional().describe("Enable numeric ID support."),
    },
    { title: "Search Employees", readOnlyHint: true, openWorldHint: true },
    async (params) => {
      const result = await makeRequest("/api/v2/company/employee/search/", params);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );
}
