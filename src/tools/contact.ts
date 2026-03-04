import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { makeRequest } from "../client.js";

export function register(server: McpServer) {
  // 12. Reverse Email Lookup
  server.tool(
    "enrich_reverse_email",
    "Look up a person's professional network profile by their email address. Cost: 3 credits.",
    {
      email: z.string().describe("Email address to look up, e.g. johndoe@enrichlayer.com"),
      lookup_depth: z.enum(["superficial", "deep"]).optional().describe("Depth of lookup."),
      enrich_profile: z.enum(["skip", "enrich"]).optional().describe("Enrich result with cached profile data."),
    },
    { title: "Reverse Email Lookup", readOnlyHint: true, openWorldHint: true },
    async (params) => {
      const result = await makeRequest("/api/v2/profile/resolve/email", params);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // 13. Reverse Phone Lookup
  server.tool(
    "enrich_reverse_phone",
    "Look up a person's professional network profile by their phone number. Cost: 3 credits.",
    {
      phone_number: z.string().describe("E.164 formatted phone number, e.g. +14155552671"),
    },
    { title: "Reverse Phone Lookup", readOnlyHint: true, openWorldHint: true },
    async (params) => {
      const result = await makeRequest("/api/v2/resolve/phone", params);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // 14. Work Email Lookup
  server.tool(
    "enrich_work_email",
    "Get the work email address of a person from their professional network profile URL. Cost: 3 credits.",
    {
      profile_url: z.string().describe("Professional network profile URL"),
      callback_url: z.string().optional().describe("Webhook URL for async notification."),
    },
    { title: "Get Work Email", readOnlyHint: true, openWorldHint: true },
    async (params) => {
      const result = await makeRequest("/api/v2/profile/email", params);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // 15. Get Personal Contact
  server.tool(
    "enrich_personal_contact",
    "Get personal contact phone numbers of a person. Provide at least one of: profile_url, twitter_profile_url, or facebook_profile_url. Cost: 1 credit per contact number.",
    {
      profile_url: z.string().optional().describe("Professional network profile URL"),
      twitter_profile_url: z.string().optional().describe("Twitter/X profile URL"),
      facebook_profile_url: z.string().optional().describe("Facebook profile URL"),
      page_size: z.string().optional().describe("Max results per call (default 0 = no limit)."),
    },
    { title: "Get Personal Contact", readOnlyHint: true, openWorldHint: true },
    async (params) => {
      const result = await makeRequest("/api/v2/contact-api/personal-contact", params);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // 16. Get Personal Email
  server.tool(
    "enrich_personal_email",
    "Get personal email addresses of a person. Provide at least one of: profile_url, twitter_profile_url, or facebook_profile_url. Cost: 1 credit per email.",
    {
      profile_url: z.string().optional().describe("Professional network profile URL"),
      twitter_profile_url: z.string().optional().describe("Twitter/X profile URL"),
      facebook_profile_url: z.string().optional().describe("Facebook profile URL"),
      email_validation: z.enum(["none", "fast", "precise"]).optional().describe("Email validation method."),
      page_size: z.string().optional().describe("Max results per call (default 0 = no limit)."),
    },
    { title: "Get Personal Email", readOnlyHint: true, openWorldHint: true },
    async (params) => {
      const result = await makeRequest("/api/v2/contact-api/personal-email", params);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // 17. Check Disposable Email
  server.tool(
    "enrich_disposable_email",
    "Check if an email address is from a disposable email provider. Cost: 0 credits.",
    {
      email: z.string().describe("Email address to check, e.g. johndoe@enrichlayer.com"),
    },
    { title: "Check Disposable Email", readOnlyHint: true, openWorldHint: true },
    async (params) => {
      const result = await makeRequest("/api/v2/disposable-email", params);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );
}
