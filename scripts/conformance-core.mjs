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
  for (const [path, operations] of Object.entries(specPaths)) {
    const parameters = operations.get?.parameters ?? [];
    const queryParams = new Map();
    for (const p of parameters) {
      if (p.in === "query") queryParams.set(p.name, p.required === true);
    }
    specParamsByPath.set(normalizePath(path), queryParams);
  }

  const failures = [];
  const warnings = [];

  for (const def of toolDefs) {
    const specParams = specParamsByPath.get(normalizePath(def.path));
    if (!specParams) {
      failures.push(`${def.name}: endpoint ${def.path} not found in spec`);
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
