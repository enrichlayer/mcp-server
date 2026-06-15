// Pure conformance logic — no I/O, unit-tested in conformance-core.test.mjs.
//
// Compares MCP tool definitions against the OpenAPI spec:
//   - tool endpoint must exist in the spec                      -> failure
//   - every tool parameter must be a query param of that path   -> failure
//   - required-ness must match between tool and spec            -> failure
//   - a required spec param the tool omits                      -> failure
//   - an optional spec param the tool omits                     -> warning (curated subset is fine)
//
// Param name-matching only: the spec does not encode enum values or types
// for query params, so those are deliberately out of scope.

export const normalizePath = (path) => path.replace(/\/+$/, "");

/**
 * @param {Record<string, {get?: {parameters?: Array<{name:string, in:string, required?:boolean}>}}>} specPaths
 *        spec.paths from the parsed OpenAPI document
 * @param {Array<{name:string, path:string, schema:Record<string, {isOptional?: () => boolean}>}>} toolDefs
 *        built MCP tool definitions (schema values are Zod types)
 * @returns {{failures: string[], warnings: string[]}}
 */
export function evaluate(specPaths, toolDefs) {
  const specParamsByPath = new Map();
  const unresolvablePaths = new Map();
  for (const [path, pathItem] of Object.entries(specPaths)) {
    const key = normalizePath(path);
    // Merge path-item-level params (shared across methods) with the GET op's;
    // operation-level wins on name clashes (Map last-write), matching OpenAPI.
    const rawParams = [...(pathItem?.parameters ?? []), ...(pathItem?.get?.parameters ?? [])];
    const queryParams = new Map();
    for (const p of rawParams) {
      // A $ref (or otherwise non-inline) parameter has no resolvable name/in.
      // Don't silently misreport — flag the whole path as unresolvable.
      if (p == null || p.$ref || typeof p.name !== "string" || typeof p.in !== "string") {
        unresolvablePaths.set(key, "a parameter that is a $ref or non-inline object the checker can't resolve");
        continue;
      }
      if (p.in === "query") queryParams.set(p.name, p.required === true);
    }
    specParamsByPath.set(key, queryParams);
  }

  const failures = [];
  const warnings = [];

  // NOTE: each tool is validated independently against its endpoint's full
  // param set. If two tools were ever mapped to the same path and one was a
  // narrow curated subset omitting a required param, that would false-fail.
  // All current tool paths are distinct, so this is not exercised.
  for (const def of toolDefs) {
    const key = normalizePath(def.path);
    const specParams = specParamsByPath.get(key);
    if (!specParams) {
      failures.push(`${def.name}: endpoint ${def.path} not found in spec`);
      continue;
    }
    if (unresolvablePaths.has(key)) {
      failures.push(`${def.name}: spec ${def.path} has ${unresolvablePaths.get(key)} — inline it or extend the checker`);
      continue;
    }

    const toolRequired = new Map();
    for (const [name, zodType] of Object.entries(def.schema)) {
      toolRequired.set(name, !zodType.isOptional?.());
    }

    for (const [name, isRequired] of toolRequired) {
      if (!specParams.has(name)) {
        failures.push(`${def.name}: parameter '${name}' is not documented for ${def.path} in the spec`);
        continue;
      }
      const specRequired = specParams.get(name);
      if (isRequired !== specRequired) {
        failures.push(
          `${def.name}: parameter '${name}' is ${isRequired ? "required" : "optional"} in the tool ` +
            `but ${specRequired ? "required" : "optional"} in the spec`,
        );
      }
    }

    const uncoveredOptional = [];
    for (const [name, specRequired] of specParams) {
      if (toolRequired.has(name)) continue;
      if (specRequired) {
        failures.push(`${def.name}: required spec param '${name}' for ${def.path} is not exposed by the tool`);
      } else {
        uncoveredOptional.push(name);
      }
    }
    if (uncoveredOptional.length > 0) {
      warnings.push(`${def.name}: spec params not exposed by the tool: ${uncoveredOptional.join(", ")}`);
    }
  }

  return { failures, warnings };
}
