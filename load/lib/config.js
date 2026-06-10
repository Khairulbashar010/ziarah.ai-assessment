/**
 * Shared k6 config — thresholds align with design-docs/system-design.md latency budget
 * and kubernetes.md capacity planning (~100 in-flight searches per pod).
 */

export const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";

/** p95 search latency SLO (ms) — GLOBAL_TIMEOUT_MS / design target */
export const P95_SLO_MS = Number(__ENV.P95_SLO_MS || 3000);

/** Max acceptable error rate for healthy mock-mode runs */
export const MAX_ERROR_RATE = Number(__ENV.MAX_ERROR_RATE || 0.02);

export const defaultThresholds = {
  http_req_failed: [`rate<${MAX_ERROR_RATE}`],
  checks: ["rate>0.98"],
};

export const searchThresholds = {
  ...defaultThresholds,
  "http_req_duration{endpoint:search}": [`p(95)<${P95_SLO_MS}`],
};

export const streamThresholds = {
  ...defaultThresholds,
  "search_stream_duration": [`p(95)<${P95_SLO_MS}`],
};

export function searchUrl() {
  return `${BASE_URL}/api/trips/search`;
}

export function streamUrl() {
  return `${BASE_URL}/api/trips/search/stream`;
}

export function healthUrl() {
  return `${BASE_URL}/api/health`;
}
