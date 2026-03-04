import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { makeRequest } from "../client.js";

export function register(server: McpServer) {
  // 23. Search Companies
  server.tool(
    "enrich_company_search",
    "Search for companies by various criteria including location, industry, size, funding, and more. Returns professional network URLs. Cost: 3 credits per URL returned.",
    {
      country: z.string().optional().describe("ISO3166 country code, e.g. US"),
      region: z.string().optional().describe("State, province, or region (Boolean search), e.g. Maryland OR 'New York'"),
      city: z.string().optional().describe("City name (Boolean search), e.g. 'Los Angeles'"),
      type: z.enum(["EDUCATIONAL", "GOVERNMENT_AGENCY", "NON_PROFIT", "PARTNERSHIP", "PRIVATELY_HELD", "PUBLIC_COMPANY", "SELF_EMPLOYED", "SELF_OWNED"]).optional().describe("Type of company."),
      follower_count_min: z.string().optional().describe("Minimum follower count, e.g. 1000"),
      follower_count_max: z.string().optional().describe("Maximum follower count, e.g. 10000"),
      name: z.string().optional().describe("Company name (Boolean search), e.g. circle || amelex"),
      industry: z.string().optional().describe("Industry (Boolean search), e.g. technology || manufacturing"),
      primary_industry: z.string().optional().describe("Primary industry (Boolean search), e.g. software development"),
      specialities: z.string().optional().describe("Company specialities (Boolean search), e.g. innovative product development"),
      employee_count_category: z.enum(["custom", "startup", "small", "medium", "large", "enterprise"]).optional().describe("Employee count category."),
      employee_count_min: z.string().optional().describe("Minimum employee count, e.g. 100"),
      employee_count_max: z.string().optional().describe("Maximum employee count, e.g. 1000"),
      description: z.string().optional().describe("Company description (Boolean search), e.g. navy or naval"),
      founded_after_year: z.string().optional().describe("Founded after this year, e.g. 1985"),
      founded_before_year: z.string().optional().describe("Founded before this year, e.g. 2015"),
      funding_amount_min: z.string().optional().describe("Minimum funding amount in USD, e.g. 1000000"),
      funding_amount_max: z.string().optional().describe("Maximum funding amount in USD, e.g. 1000000"),
      funding_raised_after: z.string().optional().describe("Funding raised after this date (YYYY-MM-DD), e.g. 2019-12-30"),
      funding_raised_before: z.string().optional().describe("Funding raised before this date (YYYY-MM-DD), e.g. 2019-12-30"),
      page_size: z.string().optional().describe("Max results per call (1-100, or 1-10 if enriched), e.g. 10"),
      enrich_profiles: z.enum(["skip", "enrich"]).optional().describe("Return complete profile data."),
      use_cache: z.enum(["if-present", "if-recent"]).optional().describe("Cache freshness guarantee."),
    },
    { title: "Search Companies", readOnlyHint: true, openWorldHint: true },
    async (params) => {
      const result = await makeRequest("/api/v2/search/company", params);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // 24. Search People
  server.tool(
    "enrich_person_search",
    "Search for people by various criteria including name, location, education, role, company, and more. Returns professional network URLs. Cost: 3 credits per URL returned.",
    {
      country: z.string().describe("ISO3166 country code (required), e.g. US"),
      first_name: z.string().optional().describe("First name (Boolean search), e.g. Bill OR Mark"),
      last_name: z.string().optional().describe("Last name (Boolean search), e.g. Gates or Zuckerberg"),
      education_field_of_study: z.string().optional().describe("Field of study (Boolean search), e.g. computer science"),
      education_degree_name: z.string().optional().describe("Degree name (Boolean search), e.g. MBA"),
      education_school_name: z.string().optional().describe("School name (Boolean search), e.g. 'Harvard University'"),
      education_school_profile_url: z.string().optional().describe("School professional network profile URL."),
      current_role_title: z.string().optional().describe("Current role title (Boolean search), e.g. CEO || Founder"),
      past_role_title: z.string().optional().describe("Past role title (Boolean search), e.g. founder"),
      current_role_before: z.string().optional().describe("Started current role before this date (ISO8601), e.g. 2019-12-30"),
      current_role_after: z.string().optional().describe("Started current role after this date (ISO8601), e.g. 2019-12-30"),
      current_company_profile_url: z.string().optional().describe("Currently working at this company (professional network URL)."),
      past_company_profile_url: z.string().optional().describe("Previously worked at this company (professional network URL)."),
      current_job_description: z.string().optional().describe("Current job description (Boolean search)."),
      past_job_description: z.string().optional().describe("Past job description (Boolean search)."),
      current_company_name: z.string().optional().describe("Current company name (Boolean search)."),
      past_company_name: z.string().optional().describe("Past company name (Boolean search)."),
      groups: z.string().optional().describe("Group membership (Boolean search)."),
      languages: z.string().optional().describe("Languages (Boolean search)."),
      region: z.string().optional().describe("Region, state, or province (Boolean search)."),
      city: z.string().optional().describe("City (Boolean search)."),
      headline: z.string().optional().describe("Headline field (Boolean search)."),
      summary: z.string().optional().describe("Summary field (Boolean search)."),
      industries: z.string().optional().describe("Inferred industry (Boolean search)."),
      interests: z.string().optional().describe("Interests (Boolean search)."),
      skills: z.string().optional().describe("Skills (Boolean search)."),
    },
    { title: "Search People", readOnlyHint: true, openWorldHint: true },
    async (params) => {
      const result = await makeRequest("/api/v2/search/person", params);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );
}
