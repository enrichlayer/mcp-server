import { z } from "zod";
import { ToolDef } from "./registry.js";

export const toolDefs: ToolDef[] = [
  // 20. Get Job Profile
  {
    name: "enrich_job_profile",
    title: "Get Job Profile",
    description:
      "Get structured data of a job posting from its professional network URL. Returns job title, description, company, location, and more. Cost: 2 credits.",
    path: "/api/v2/job",
    schema: {
      url: z.string().describe("Professional network job posting URL"),
    },
  },

  // 21. Search Jobs
  {
    name: "enrich_job_search",
    title: "Search Jobs",
    description: "Search for job postings. Filter by company, type, experience level, location, and more. Cost: 2 credits.",
    path: "/api/v2/company/job",
    schema: {
      search_id: z.string().optional().describe("search_id of the company (get via Company Profile API), e.g. 2790400"),
      job_type: z.enum(["full-time", "part-time", "contract", "internship", "temporary", "volunteer", "anything"]).optional().describe("Nature of the job."),
      experience_level: z.enum(["internship", "entry_level", "associate", "mid_senior_level", "director", "anything"]).optional().describe("Experience level needed."),
      when: z.enum(["yesterday", "past-week", "past-month", "anytime"]).optional().describe("When the job was posted."),
      flexibility: z.enum(["remote", "on-site", "hybrid", "anything"]).optional().describe("Job flexibility."),
      geo_id: z.string().optional().describe("geo_id of the location to search, e.g. 92000000"),
      keyword: z.string().optional().describe("Keyword to search for, e.g. engineer"),
    },
  },

  // 22. Get Job Count
  {
    name: "enrich_job_count",
    title: "Get Job Count",
    description: "Get the number of job postings matching your criteria. Cost: 2 credits.",
    path: "/api/v2/company/job/count",
    schema: {
      search_id: z.string().optional().describe("search_id of the company, e.g. 2790400"),
      job_type: z.enum(["full-time", "part-time", "contract", "internship", "temporary", "volunteer", "anything"]).optional().describe("Nature of the job."),
      experience_level: z.enum(["internship", "entry_level", "associate", "mid_senior_level", "director", "anything"]).optional().describe("Experience level needed."),
      when: z.enum(["yesterday", "past-week", "past-month", "anytime"]).optional().describe("When the job was posted."),
      flexibility: z.enum(["remote", "on-site", "hybrid", "anything"]).optional().describe("Job flexibility."),
      geo_id: z.string().optional().describe("geo_id of the location to search, e.g. 92000000"),
      keyword: z.string().optional().describe("Keyword to search for, e.g. engineer"),
    },
  },
];
