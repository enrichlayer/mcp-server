import {
  captureException as captureExceptionSdk,
  flush as flushSdk,
  init as initSdk,
  type CaptureContext,
  type ErrorEvent,
  type NodeOptions,
} from "@sentry/node";
import { createRequire } from "node:module";

const { version } = createRequire(import.meta.url)("../package.json") as {
  version: string;
};

const FLUSH_TIMEOUT_MS = 2_000;
const REDACTED = "[REDACTED]";
const MAX_SCRUB_DEPTH = 8;

const SECRET_KEY_PATTERN =
  /(?:api[_-]?key|authorization|cookie|credential|dsn|password|secret|token)/i;

const SECRET_VALUE_PATTERNS = [
  /\b(?:glpat|gh[pousr]|xox[baprs]-|xapp-\d+-|sk-)[A-Za-z0-9._-]+\b/gi,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gi,
  /\bBearer\s+[A-Za-z0-9._~+/=-]+\b/gi,
  /([?&](?:access[_-]?token|api[_-]?key|auth(?:orization)?|password|secret|token)=)[^&\s]+/gi,
  /(https?:\/\/)([^/@\s:]+):([^/@\s]+)@/gi,
];

export interface SentrySdk {
  init(options: NodeOptions): unknown;
  captureException(error: unknown, context?: CaptureContext): string | undefined;
  flush(timeout: number): Promise<boolean>;
}

export interface McpSentryConfig {
  dsn?: string;
  environment?: string;
  release?: string;
  service?: string;
  sdk?: SentrySdk;
}

export interface RequestFailureContext {
  method: string;
  path: string;
  statusCode?: number;
}

export interface McpSentry {
  readonly enabled: boolean;
  captureStartupFailure(error: unknown, stage: string): void;
  captureRequestFailure(error: unknown, request: RequestFailureContext): void;
  flush(): Promise<boolean>;
  shutdown(): Promise<void>;
}

const defaultSdk: SentrySdk = {
  init: initSdk,
  captureException: captureExceptionSdk,
  flush: flushSdk,
};

function scrubText(value: string): string {
  let scrubbed = value;
  for (const pattern of SECRET_VALUE_PATTERNS) {
    scrubbed = scrubbed.replace(pattern, (_match, prefix?: string) =>
      prefix ? `${prefix}${REDACTED}` : REDACTED,
    );
  }
  return scrubbed;
}

function scrubValue(value: unknown, depth = 0): unknown {
  if (depth > MAX_SCRUB_DEPTH) {
    return REDACTED;
  }
  if (typeof value === "string") {
    return scrubText(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => scrubValue(item, depth + 1));
  }
  if (value && typeof value === "object") {
    const scrubbed: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      scrubbed[key] = SECRET_KEY_PATTERN.test(key)
        ? REDACTED
        : scrubValue(item, depth + 1);
    }
    return scrubbed;
  }
  return value;
}

function scrubError(error: unknown): Error {
  if (error instanceof Error) {
    const safeError = new Error(scrubText(error.message));
    safeError.name = scrubText(error.name);
    if (error.stack) {
      safeError.stack = scrubText(error.stack);
    }
    return safeError;
  }
  return new Error(scrubText(String(error)));
}

export function safeErrorForLog(error: unknown): {
  name: string;
  message: string;
  stack?: string;
} {
  const safeError = scrubError(error);
  return {
    name: safeError.name,
    message: safeError.message,
    ...(safeError.stack ? { stack: safeError.stack } : {}),
  };
}

function scrubEvent(event: ErrorEvent): ErrorEvent {
  return scrubValue(event) as ErrorEvent;
}

export function createMcpSentry(config: McpSentryConfig = {}): McpSentry {
  const dsn = (config.dsn ?? process.env.SENTRY_DSN)?.trim();
  const environment =
    config.environment ?? process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? "development";
  const release =
    config.release ?? process.env.SENTRY_RELEASE ?? process.env.npm_package_version ?? version;
  const service = config.service ?? process.env.SENTRY_SERVICE ?? "enrich-layer-mcp-server";
  const sdk = config.sdk ?? defaultSdk;
  const tags = { service, environment, release };

  if (!dsn) {
    return {
      enabled: false,
      captureStartupFailure: () => undefined,
      captureRequestFailure: () => undefined,
      flush: async () => true,
      shutdown: async () => undefined,
    };
  }

  try {
    sdk.init({
      dsn,
      environment,
      release,
      defaultIntegrations: false,
      sendDefaultPii: false,
      tracesSampleRate: 0,
      initialScope: { tags },
      beforeSend: scrubEvent,
    });
  } catch {
    return {
      enabled: false,
      captureStartupFailure: () => undefined,
      captureRequestFailure: () => undefined,
      flush: async () => true,
      shutdown: async () => undefined,
    };
  }

  const capture = (
    error: unknown,
    operation: string,
    additionalTags: Record<string, string | undefined>,
    context: Record<string, unknown>,
  ): void => {
    try {
      sdk.captureException(scrubError(error), {
        tags: {
          ...tags,
          operation,
          ...Object.fromEntries(
            Object.entries(additionalTags).filter(([, value]) => value !== undefined),
          ),
        },
        contexts: { mcp: scrubValue(context) as Record<string, unknown> },
      });
    } catch {
      // Reporting must never change the server's failure behavior.
    }
  };

  const flush = async (): Promise<boolean> => {
    try {
      return await sdk.flush(FLUSH_TIMEOUT_MS);
    } catch {
      return false;
    }
  };

  return {
    enabled: true,
    captureStartupFailure: (error, stage) => {
      capture(error, "startup", { stage }, {});
    },
    captureRequestFailure: (error, request) => {
      capture(
        error,
        "request",
        {
          method: request.method,
          path: request.path.split("?", 1)[0],
          status_code: request.statusCode?.toString(),
        },
        { method: request.method, path: request.path.split("?", 1)[0] },
      );
    },
    flush,
    shutdown: async () => {
      await flush();
    },
  };
}
