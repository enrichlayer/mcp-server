import assert from "node:assert/strict";
import { test } from "node:test";
import { createToolHandler } from "../build/tools/registry.js";

test("tool failures are reported before MCP converts them to isError results", async () => {
  const failure = new Error("upstream unavailable");
  const reports = [];
  const handler = createToolHandler(
    { name: "enrich_company_lookup", path: "/v2/company/lookup" },
    (error, context) => reports.push({ error, context }),
    async () => {
      throw failure;
    },
  );

  await assert.rejects(handler({ company_name: "Example" }), failure);
  assert.equal(reports.length, 1);
  assert.equal(reports[0].error, failure);
  assert.deepEqual(reports[0].context, {
    name: "enrich_company_lookup",
    path: "/v2/company/lookup",
  });
});
