/**
 * RFC 8707 canonical resource identifiers for this MCP server.
 *
 * Claude sends `resource=<the URL the user typed>` on every authorization and
 * token request; the MCP authorization spec requires the resource server to
 * accept only tokens minted for itself, so both sides of the OAuth pair agree
 * on this canonical form (lowercase scheme/host, no default port, no
 * fragment, no trailing slash).
 */
export const MCP_PATH = "/mcp";

export function canonicalizeResource(input: string): string {
  const url = new URL(input);
  if (url.hash) {
    throw new Error("resource identifier must not contain a fragment");
  }
  // `url.host` is already lowercase and omits default ports; `url.protocol`
  // is lowercase. Only the trailing slash needs normalizing by hand.
  const path = url.pathname.replace(/\/+$/, "");
  return `${url.protocol}//${url.host}${path}${url.search}`;
}

/**
 * Audiences a token may carry to be accepted here: the `/mcp` endpoint first
 * (what a user types into Claude), then the bare origin.
 */
export function expectedAudiences(mcpBaseUrl: string): string[] {
  const origin = canonicalizeResource(mcpBaseUrl);
  return [`${origin}${MCP_PATH}`, origin];
}

/** The identifier advertised in protected-resource metadata. */
export function resourceIdentifier(mcpBaseUrl: string): string {
  return expectedAudiences(mcpBaseUrl)[0]!;
}
