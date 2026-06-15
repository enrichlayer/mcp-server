import { z } from "zod";
import { ToolDef } from "./registry.js";

export const toolDefs: ToolDef[] = [
  // 12. Reverse Email Lookup
  {
    name: "enrich_reverse_email",
    title: "Reverse Email Lookup",
    description: "Look up a person's professional network profile by their email address. Cost: 3 credits.",
    path: "/api/v2/profile/resolve/email",
    schema: {
      email: z.string().describe("Email address to look up, e.g. johndoe@enrichlayer.com"),
      lookup_depth: z.enum(["superficial", "deep"]).optional().describe("Depth of lookup."),
      enrich_profile: z.enum(["skip", "enrich"]).optional().describe("Enrich result with cached profile data."),
    },
  },

  // 13. Reverse Phone Lookup
  {
    name: "enrich_reverse_phone",
    title: "Reverse Phone Lookup",
    description: "Look up a person's professional network profile by their phone number. Cost: 3 credits.",
    path: "/api/v2/resolve/phone",
    schema: {
      phone_number: z.string().describe("E.164 formatted phone number, e.g. +14155552671"),
    },
  },

  // 14. Work Email Lookup
  {
    name: "enrich_work_email",
    title: "Get Work Email",
    description: "Get the work email address of a person from their professional network profile URL. Cost: 3 credits.",
    path: "/api/v2/profile/email",
    schema: {
      profile_url: z.string().describe("Professional network profile URL"),
      callback_url: z.string().optional().describe("Webhook URL for async notification."),
    },
  },

  // 15. Get Personal Contact
  {
    name: "enrich_personal_contact",
    title: "Get Personal Contact",
    description:
      "Get personal contact phone numbers of a person. Provide at least one of: profile_url, twitter_profile_url, or facebook_profile_url. Cost: 1 credit per contact number.",
    path: "/api/v2/contact-api/personal-contact",
    schema: {
      profile_url: z.string().optional().describe("Professional network profile URL"),
      twitter_profile_url: z.string().optional().describe("Twitter/X profile URL"),
      facebook_profile_url: z.string().optional().describe("Facebook profile URL"),
      page_size: z.string().optional().describe("Max results per call (default 0 = no limit)."),
    },
  },

  // 16. Get Personal Email
  {
    name: "enrich_personal_email",
    title: "Get Personal Email",
    description:
      "Get personal email addresses of a person. Provide at least one of: profile_url, twitter_profile_url, or facebook_profile_url. Cost: 1 credit per email.",
    path: "/api/v2/contact-api/personal-email",
    schema: {
      profile_url: z.string().optional().describe("Professional network profile URL"),
      twitter_profile_url: z.string().optional().describe("Twitter/X profile URL"),
      facebook_profile_url: z.string().optional().describe("Facebook profile URL"),
      email_validation: z.enum(["none", "fast", "precise"]).optional().describe("Email validation method."),
      page_size: z.string().optional().describe("Max results per call (default 0 = no limit)."),
    },
  },

  // 17. Check Disposable Email
  {
    name: "enrich_disposable_email",
    title: "Check Disposable Email",
    description: "Check if an email address is from a disposable email provider. Cost: 0 credits.",
    path: "/api/v2/disposable-email",
    schema: {
      email: z.string().describe("Email address to check, e.g. johndoe@enrichlayer.com"),
    },
  },
];
