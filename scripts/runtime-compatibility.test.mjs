import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url)));
const packageLock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url)));

test("the package engine range matches the resolved OpenTelemetry Node support", () => {
  const expected = "^18.19.0 || >=20.6.0";
  assert.equal(packageJson.engines.node, expected);
  assert.equal(packageLock.packages[""].engines.node, expected);
});
