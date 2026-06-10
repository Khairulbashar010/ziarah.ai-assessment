import pino, { type Logger } from "pino";

const SERVICE_NAME = process.env.SERVICE_NAME ?? "ziarah-trip-search";

function resolveLogLevel(): pino.LevelWithSilent {
  const level = process.env.LOG_LEVEL?.toLowerCase();
  if (level === "silent" || level === "trace" || level === "debug" || level === "info" || level === "warn" || level === "error" || level === "fatal") {
    return level;
  }
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

export const rootLogger: Logger = pino({
  level: resolveLogLevel(),
  base: { service: SERVICE_NAME },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label }),
  },
});

export function requestLogger(requestId: string, route: string): Logger {
  return rootLogger.child({ requestId, route });
}

export type FailedProviderLog = {
  name: string;
  status: string;
  error?: string;
  durationMs: number;
};

export function logSearchStart(
  log: Logger,
  details: { queryLength: number; hasContext: boolean },
): void {
  log.info({ event: "search_start", ...details }, "trip search started");
}

export function logSearchComplete(
  log: Logger,
  details: {
    durationMs: number;
    statusCode: number;
    cacheStatus?: string;
    providersSucceeded?: number;
  },
): void {
  log.info({ event: "search_complete", ...details }, "trip search completed");
}

export function logApiError(
  log: Logger,
  details: {
    event: string;
    statusCode: number;
    durationMs: number;
    err?: unknown;
    message?: string;
  },
): void {
  const { err, ...fields } = details;
  if (err instanceof Error) {
    log.error({ ...fields, err: { type: err.name, message: err.message, stack: err.stack } }, fields.message ?? "api error");
    return;
  }
  if (err !== undefined) {
    log.error({ ...fields, err }, fields.message ?? "api error");
    return;
  }
  log.error(fields, fields.message ?? "api error");
}

export function logQuorumFailure(
  log: Logger,
  details: {
    providersSucceeded: number;
    providersRequired: number;
    providerTimeoutMs: number;
    failedProviders: FailedProviderLog[];
    durationMs?: number;
    cacheStatus?: string;
  },
): void {
  log.error(
    { event: "quorum_failure", ...details },
    "quorum not met — fewer than required providers succeeded",
  );
}

export function logProviderResult(
  log: Logger,
  details: {
    provider: string;
    status: string;
    offerCount: number;
    durationMs: number;
    error?: string;
  },
): void {
  const level = details.status === "success" ? "info" : "warn";
  log[level]({ event: "provider_result", ...details }, `provider ${details.provider} ${details.status}`);
}

export function logLlmParseComplete(
  log: Logger,
  details: {
    durationMs: number;
    timeoutMs: number;
    promptTokens?: number;
    completionTokens?: number;
    cachedPromptTokens?: number;
    mode: "sync" | "stream";
  },
): void {
  log.info({ event: "llm_parse_complete", ...details }, "openai trip parse completed");
}

export function logLlmParseFallback(
  log: Logger,
  details: {
    reason: "timeout" | "error";
    timeoutMs?: number;
    mode: "sync" | "stream";
  },
): void {
  log.warn({ event: "llm_parse_fallback", ...details }, "openai trip parse failed — using regex fallback");
}

export function logCacheRefreshFailure(log: Logger, err: unknown, context: "background" | "stale"): void {
  const message = context === "stale" ? "stale cache refresh failed" : "cache refresh failed";
  if (err instanceof Error) {
    log.warn(
      { event: "cache_refresh_failed", context, err: { type: err.name, message: err.message } },
      message,
    );
    return;
  }
  log.warn({ event: "cache_refresh_failed", context, err }, message);
}

export function logRedisError(err: unknown): void {
  if (err instanceof Error) {
    rootLogger.error(
      { event: "redis_error", err: { type: err.name, message: err.message } },
      "redis client error",
    );
    return;
  }
  rootLogger.error({ event: "redis_error", err }, "redis client error");
}
