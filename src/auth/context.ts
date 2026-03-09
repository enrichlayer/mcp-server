import { AsyncLocalStorage } from "node:async_hooks";

interface AuthContext {
  apiKey: string;
}

export const authContext = new AsyncLocalStorage<AuthContext>();

export function getCurrentApiKey(): string | undefined {
  return authContext.getStore()?.apiKey;
}
