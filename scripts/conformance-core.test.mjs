import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluate, normalizePath } from "./conformance-core.mjs";

// Minimal Zod-like stubs: only isOptional() is read by the core.
const required = () => ({ isOptional: () => false });
const optional = () => ({ isOptional: () => true });

const specPaths = {
  "/api/v2/thing": {
    get: {
      parameters: [
        { name: "url", in: "query", required: true },
        { name: "use_cache", in: "query", required: false },
        { name: "extra", in: "query" }, // required omitted => optional
        { name: "body_only", in: "header", required: true }, // non-query, ignored
      ],
    },
  },
  // trailing slash on the spec side; tool uses no slash
  "/api/v2/listing/": {
    get: { parameters: [{ name: "id", in: "query", required: true }] },
  },
};

test("clean tool passes with no failures", () => {
  const { failures } = evaluate(specPaths, [
    { name: "t", path: "/api/v2/thing", schema: { url: required(), use_cache: optional() } },
  ]);
  assert.deepEqual(failures, []);
});

test("unknown endpoint fails", () => {
  const { failures } = evaluate(specPaths, [
    { name: "t", path: "/api/v2/nope", schema: {} },
  ]);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /not found in spec/);
});

test("tool param absent from spec fails", () => {
  const { failures } = evaluate(specPaths, [
    { name: "t", path: "/api/v2/thing", schema: { url: required(), bogus: optional() } },
  ]);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /bogus.*not documented/);
});

test("required mismatch fails (tool required, spec optional)", () => {
  const { failures } = evaluate(specPaths, [
    { name: "t", path: "/api/v2/thing", schema: { url: required(), use_cache: required() } },
  ]);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /use_cache.*required in the tool but optional in the spec/);
});

test("required mismatch fails (tool optional, spec required)", () => {
  const { failures } = evaluate(specPaths, [
    { name: "t", path: "/api/v2/thing", schema: { url: optional() } },
  ]);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /url.*optional in the tool but required in the spec/);
});

test("uncovered required spec param fails", () => {
  // tool omits 'url' (required in spec) entirely
  const { failures } = evaluate(specPaths, [
    { name: "t", path: "/api/v2/thing", schema: { use_cache: optional() } },
  ]);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /required spec param 'url'.*not exposed/);
});

test("uncovered optional spec param is a warning, not a failure", () => {
  const { failures, warnings } = evaluate(specPaths, [
    { name: "t", path: "/api/v2/thing", schema: { url: required() } },
  ]);
  assert.deepEqual(failures, []);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /use_cache, extra/);
});

test("trailing-slash spec path matches slashless tool path", () => {
  const { failures } = evaluate(specPaths, [
    { name: "t", path: "/api/v2/listing", schema: { id: required() } },
  ]);
  assert.deepEqual(failures, []);
});

test("normalizePath strips trailing slashes", () => {
  assert.equal(normalizePath("/a/b/"), "/a/b");
  assert.equal(normalizePath("/a/b"), "/a/b");
});
