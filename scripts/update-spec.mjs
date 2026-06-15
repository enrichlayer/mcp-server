// Refresh the vendored copy of the Enrich Layer OpenAPI spec.
// Usage: npm run update-spec
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const SPEC_URL = "https://enrichlayer.com/docs/api/v2/openapi.yaml";
const SPEC_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "../spec/enrichlayer-api.yaml");

let response;
try {
  response = await fetch(SPEC_URL);
} catch (error) {
  console.error(`Failed to reach ${SPEC_URL}: ${error.message}`);
  process.exit(1);
}
if (!response.ok) {
  console.error(`Failed to fetch ${SPEC_URL}: ${response.status} ${response.statusText}`);
  process.exit(1);
}
const body = await response.text();

// Validate it actually parses as an OpenAPI document with a paths object before
// overwriting the vendored copy — guards against HTML error pages / truncation.
let doc;
try {
  doc = parse(body);
} catch (error) {
  console.error(`Downloaded document is not valid YAML: ${error.message} — not writing.`);
  process.exit(1);
}
if (!doc || typeof doc.paths !== "object" || doc.paths === null) {
  console.error("Downloaded document has no 'paths' object — not an OpenAPI spec, not writing.");
  process.exit(1);
}

await mkdir(dirname(SPEC_PATH), { recursive: true });
await writeFile(SPEC_PATH, body);
console.log(`Updated ${SPEC_PATH} from ${SPEC_URL}.`);
console.log("Review the diff (git diff spec/), then run: npm run build && npm run check:spec");
