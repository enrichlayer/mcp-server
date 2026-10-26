import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { InvalidTokenError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import { errors as joseErrors, jwtVerify, type JWTPayload } from "jose";
import { safeErrorForLog } from "../sentry.js";
import { canonicalizeResource, expectedAudiences } from "./resource.js";

interface TokenExtra {
  api_key: string;
}

export interface VerifierConfig {
  /** Shared HS256 secret with the authorization server (AUTH_JWT_SECRET). */
  secret: string;
  /** Exact `iss` claim the authorization server signs (AUTH_BASE_URL, canonical). */
  issuer: string;
  /** Accepted `aud` values (see expectedAudiences). */
  audiences: string[];
}

/**
 * Throws without AUTH_JWT_SECRET: a server that cannot verify any token would
 * answer 401 to every request and send every client back through OAuth.
 */
export function verifierConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): VerifierConfig {
  const secret = env.AUTH_JWT_SECRET;
  if (!secret) {
    throw new Error(
      "AUTH_JWT_SECRET is not set; the HTTP server needs the secret it shares with the authorization server to verify access tokens",
    );
  }
  return {
    secret,
    issuer: canonicalizeResource(env.AUTH_BASE_URL || "http://localhost:3001"),
    audiences: expectedAudiences(env.MCP_BASE_URL || "http://localhost:3000"),
  };
}

export function authInfoFromPayload(token: string, payload: JWTPayload): AuthInfo {
  if (typeof payload.sub !== "string" || !payload.sub) {
    throw new InvalidTokenError("Access token is missing the sub claim");
  }
  if (typeof payload.api_key !== "string" || !payload.api_key) {
    throw new InvalidTokenError("Access token is missing the api_key claim");
  }

  return {
    token,
    clientId: payload.sub,
    scopes: typeof payload.scope === "string" ? payload.scope.split(" ") : [],
    expiresAt: payload.exp,
    extra: {
      api_key: payload.api_key,
    },
  };
}

export function createVerifier(
  config: VerifierConfig,
): (token: string) => Promise<AuthInfo> {
  const key = new TextEncoder().encode(config.secret);
  return async (token) => {
    try {
      // jose rejects a missing/mismatched `iss` or `aud` and an expired `exp` —
      // the MCP spec's "MUST validate that tokens were issued specifically for
      // them" (RFC 8707 §2) is this `audience` option.
      const { payload } = await jwtVerify(token, key, {
        algorithms: ["HS256"],
        issuer: config.issuer,
        audience: config.audiences,
      });
      return authInfoFromPayload(token, payload);
    } catch (error) {
      if (error instanceof joseErrors.JOSEError) {
        throw logRejection(toInvalidTokenError(error), error);
      }
      if (error instanceof InvalidTokenError) {
        throw logRejection(error);
      }
      // Not a token problem but a fault on this side: the middleware answers
      // 500 rather than sending the client back through OAuth.
      console.error("Error verifying access token:", safeErrorForLog(error));
      throw error;
    }
  };
}

/**
 * The SDK's bearer middleware answers 401 only for InvalidTokenError and turns
 * every other throw into a 500. The MCP spec requires 401 for invalid or
 * expired tokens (it is also what makes Claude refresh a token), so jose's
 * failures are mapped here. Descriptions stay free of double quotes: the SDK
 * interpolates them verbatim into the WWW-Authenticate header.
 */
function toInvalidTokenError(error: joseErrors.JOSEError): InvalidTokenError {
  if (error instanceof joseErrors.JWTExpired) {
    return new InvalidTokenError("Access token has expired");
  }
  if (error instanceof joseErrors.JWTClaimValidationFailed) {
    if (error.claim === "aud" || error.claim === "iss") {
      return new InvalidTokenError(
        "Access token was not issued for this resource server",
      );
    }
    return new InvalidTokenError(`Access token claim ${error.claim} is invalid`);
  }
  return new InvalidTokenError("Access token is invalid");
}

/** One line per rejected token: jose's code and claim, never the token or the key. */
function logRejection(
  rejection: InvalidTokenError,
  cause?: joseErrors.JOSEError,
): InvalidTokenError {
  let detail = "";
  if (cause) {
    const claim =
      cause instanceof joseErrors.JWTClaimValidationFailed ||
      cause instanceof joseErrors.JWTExpired
        ? ` claim=${cause.claim} reason=${cause.reason}`
        : "";
    detail = ` (${cause.code}${claim})`;
  }
  console.warn(`Rejected access token: ${rejection.message}${detail}`);
  return rejection;
}

export function getApiKey(auth: AuthInfo): string {
  const extra = auth.extra as TokenExtra | undefined;
  if (!extra?.api_key) {
    throw new Error("Missing api_key in access token");
  }
  return extra.api_key;
}
