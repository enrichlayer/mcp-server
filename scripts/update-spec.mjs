// Refresh the vendored copy of the Enrich Layer OpenAPI spec.
// Usage: npm run update-spec
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SPEC_URL = "https://enrichlayer.com/docs/api/v2/openapi.yaml";
const SPEC_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "../spec/enrichlayer-api.yaml");

const response = await fetch(SPEC_URL);
if (!response.ok) {
  console.error(`Failed to fetch ${SPEC_URL}: ${response.status} ${response.statusText}`);
  process.exit(1);
}
const body = await response.text();
if (!body.includes("paths:")) {
  console.error("Downloaded document does not look like an OpenAPI spec (no 'paths:' section) — not writing.");
  process.exit(1);
}

await mkdir(dirname(SPEC_PATH), { recursive: true });
await writeFile(SPEC_PATH, body);
console.log(`Updated ${SPEC_PATH} from ${SPEC_URL}.`);
console.log("Review the diff (git diff spec/), then run: npm run build && npm run check:spec");
