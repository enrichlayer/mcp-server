import { z } from "zod";
import { ToolDef } from "./registry.js";

export const toolDefs: ToolDef[] = [
  // 8. Get Person Profile
  {
    name: "enrich_person_profile",
    title: "Get Person Profile",
    description:
      "Get structured data of a person profile. Provide exactly one of: profile_url, twitter_profile_url, or facebook_profile_url. Returns experience, education, skills, and more. Cost: 1 credit.",
    path: "/api/v2/profile",
    schema: {
      profile_url: z.string().optional().describe("Professional network profile URL"),
      twitter_profile_url: z.string().optional().describe("Twitter/X profile URL, e.g. https://x.com/johnrmarty/"),
      facebook_profile_url: z.string().optional().describe("Facebook profile URL, e.g. https://facebook.com/johnrmarty/"),
      extra: z.enum(["exclude", "include"]).optional().describe("Extra details (gender, birth date, industry, interests). Costs 1 extra credit."),
      personal_contact_number: z.enum(["exclude", "include"]).optional().describe("Include personal phone numbers. Costs 1 extra credit per number."),
      personal_email: z.enum(["exclude", "include"]).optional().describe("Include personal emails. Costs 1 extra credit per email."),
      skills: z.enum(["exclude", "include"]).optional().describe("Include skills data. No extra credit charged."),
      use_cache: z.enum(["if-present", "if-recent"]).optional().describe("Cache freshness guarantee."),
    },
  },

  // 9. Lookup Person
  {
    name: "enrich_person_lookup",
    title: "Lookup Person",
    description:
      "Look up a person by first name and company domain to find their professional network profile. Cost: 2 credits.",
    path: "/api/v2/profile/resolve",
    schema: {
      first_name: z.string().describe("First name of the person, e.g. Bill"),
      company_domain: z.string().describe("Company name or domain, e.g. gatesfoundation.org"),
      last_name: z.string().optional().describe("Last name of the person, e.g. Gates"),
      title: z.string().optional().describe("Job title at current job, e.g. Co-chair"),
      location: z.string().optional().describe("Location (country, city, or state), e.g. Seattle"),
      similarity_checks: z.enum(["include", "skip"]).optional().describe("Perform similarity checks for false positive elimination."),
      enrich_profile: z.enum(["skip", "enrich"]).optional().describe("Enrich result with cached profile data."),
    },
  },

  // 10. Get Person Profile Picture
  {
    name: "enrich_person_picture",
    title: "Get Person Picture",
    description: "Get the profile picture URL of a person. Cost: 0 credits.",
    path: "/api/v2/person/profile-picture",
    schema: {
      person_profile_url: z.string().describe("Professional network profile URL"),
    },
  },

  // 11. Lookup Role
  {
    name: "enrich_role_lookup",
    title: "Lookup Role at Company",
    description:
      "Look up a person by their role at a company. Find who holds a specific title at a given company. Cost: 3 credits.",
    path: "/api/v2/find/company/role/",
    schema: {
      company_name: z.string().describe("Name of the company, e.g. enrichlayer"),
      role: z.string().describe("Role to look up, e.g. ceo"),
      enrich_profile: z.enum(["skip", "enrich"]).optional().describe("Enrich result with cached profile data."),
    },
  },
];
