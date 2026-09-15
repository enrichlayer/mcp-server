import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { InvalidTokenError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import { errors as joseErrors, jwtVerify, type JWTPayload } from "jose";
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

export function verifierConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): VerifierConfig {
  const secret = env.AUTH_JWT_SECRET ?? "";
  if (!secret) {
    console.warn(
      "WARNING: AUTH_JWT_SECRET is not set — JWT verification will fail",
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
    let payload: JWTPayload;
    try {
      // jose rejects a missing/mismatched `iss` or `aud` and an expired `exp` —
      // the MCP spec's "MUST validate that tokens were issued specifically for
      // them" (RFC 8707 §2) is this `audience` option.
      ({ payload } = await jwtVerify(token, key, {
        algorithms: ["HS256"],
        issuer: config.issuer,
        audience: config.audiences,
      }));
    } catch (error) {
      throw toInvalidTokenError(error);
    }
    return authInfoFromPayload(token, payload);
  };
}

/**
 * The SDK's bearer middleware answers 401 only for InvalidTokenError and turns
 * every other throw into a 500. The MCP spec requires 401 for invalid or
 * expired tokens (it is also what makes Claude refresh a token), so jose's
 * failures are mapped here. Descriptions stay free of double quotes: the SDK
 * interpolates them verbatim into the WWW-Authenticate header.
 */
function toInvalidTokenError(error: unknown): InvalidTokenError {
  if (error instanceof InvalidTokenError) {
    return error;
  }
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

export const verifyAccessToken = createVerifier(verifierConfigFromEnv());

export function getApiKey(auth: AuthInfo): string {
  const extra = auth.extra as TokenExtra | undefined;
  if (!extra?.api_key) {
    throw new Error("Missing api_key in access token");
  }
  return extra.api_key;
}
