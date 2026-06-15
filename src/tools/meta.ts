import { ToolDef } from "./registry.js";

export const toolDefs: ToolDef[] = [
  // 25. Get Credit Balance
  {
    name: "enrich_credit_balance",
    title: "Check Credit Balance",
    description: "View your current Enrich Layer credit balance. Cost: 0 credits.",
    path: "/api/v2/credit-balance",
    schema: {},
  },
];
