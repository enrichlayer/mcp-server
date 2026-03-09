import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { jwtVerify } from "jose";

interface TokenExtra {
  api_key: string;
}

const AUTH_JWT_SECRET = new TextEncoder().encode(process.env.AUTH_JWT_SECRET);

if (!process.env.AUTH_JWT_SECRET) {
  console.warn(
    "WARNING: AUTH_JWT_SECRET is not set — JWT verification will fail",
  );
}

export async function verifyAccessToken(token: string): Promise<AuthInfo> {
  const { payload } = await jwtVerify(token, AUTH_JWT_SECRET, {
    algorithms: ["HS256"],
  });

  if (typeof payload.sub !== "string" || !payload.sub) {
    throw new Error("Missing sub claim in JWT");
  }
  if (typeof payload.api_key !== "string" || !payload.api_key) {
    throw new Error("Missing api_key claim in JWT");
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

export function getApiKey(auth: AuthInfo): string {
  const extra = auth.extra as TokenExtra | undefined;
  if (!extra?.api_key) {
    throw new Error("Missing api_key in access token");
  }
  return extra.api_key;
}
