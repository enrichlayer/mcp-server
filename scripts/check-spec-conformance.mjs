// Check that every MCP tool conforms to the vendored OpenAPI spec.
// Pure comparison logic lives in conformance-core.mjs (unit-tested).
//
// Run after a build (reads tool definitions from build output):
//   npm run build && npm run check:spec
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { evaluate } from "./conformance-core.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SPEC_PATH = resolve(ROOT, "spec/enrichlayer-api.yaml");
const REGISTRY_PATH = resolve(ROOT, "build/tools/registry.js");

let allToolDefs;
try {
  ({ allToolDefs } = await import(REGISTRY_PATH));
} catch {
  console.error("Build output not found — run `npm run build` first, then `npm run check:spec`.");
  process.exit(1);
}

const spec = parse(await readFile(SPEC_PATH, "utf8"));
const { failures, warnings } = evaluate(spec.paths, allToolDefs);

console.log(`Checked ${allToolDefs.length} tools against ${SPEC_PATH}`);

if (warnings.length > 0) {
  console.log(`\nWarnings (${warnings.length}) — spec params without a tool counterpart:`);
  for (const warning of warnings) console.log(`  ~ ${warning}`);
}

if (failures.length > 0) {
  console.error(`\nFailures (${failures.length}) — tool drifted from the spec:`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  console.error("\nFix the tool schema, or update the vendored spec first: npm run update-spec");
  process.exit(1);
}

console.log("\nAll tool schemas conform to the spec.");
