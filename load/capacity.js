/**
 * Ramp to high concurrency to estimate per-pod in-flight capacity.
 * Target from kubernetes.md: ~100 in-flight searches per pod (512Mi / 1 CPU).
 *
 * Run against a single pod in mock mode. Increase K6_TARGET_VUS toward 100+
 * and watch when p95 crosses 3000ms.
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { searchThresholds, searchUrl, P95_SLO_MS } from "./lib/config.js";
import { randomQuery, searchBody } from "./lib/queries.js";

const targetVus = Number(__ENV.K6_TARGET_VUS || 100);
const stepVus = Number(__ENV.K6_STEP_VUS || 10);
const stepDuration = __ENV.K6_STEP_DURATION || "1m";

const stages = [{ duration: "30s", target: stepVus }];
for (let vus = stepVus * 2; vus <= targetVus; vus += stepVus) {
  stages.push({ duration: stepDuration, target: vus });
}
stages.push({ duration: "2m", target: targetVus });
stages.push({ duration: "30s", target: 0 });

export const options = {
  scenarios: {
    capacity: {
      executor: "ramping-vus",
      startVUs: 0,
      stages,
      gracefulRampDown: "30s",
    },
  },
  thresholds: {
    ...searchThresholds,
    // Capacity probe: warn but don't fail the run when we intentionally push past SLO
    "http_req_duration{endpoint:search}": [`p(95)<${P95_SLO_MS * 2}`],
  },
};

export function setup() {
  console.log(
    `Capacity test: ramping to ${targetVus} VUs in steps of ${stepVus} (${stepDuration} each)`,
  );
  console.log(`SLO reference: p95 < ${P95_SLO_MS}ms per kubernetes.md`);
  return {};
}

export default function () {
  const res = http.post(searchUrl(), searchBody(randomQuery()), {
    headers: {
      "Content-Type": "application/json",
      "X-Request-Id": `k6-cap-${__VU}-${__ITER}`,
    },
    tags: { endpoint: "search" },
    timeout: "10s",
  });

  check(res, {
    "status is 200": (r) => r.status === 200,
  });

  sleep(0.1);
}

export function handleSummary(data) {
  const p95 =
    data.metrics["http_req_duration{endpoint:search}"]?.values?.["p(95)"] ??
    data.metrics.http_req_duration?.values?.["p(95)"];

  const lines = [
    "",
    "── Capacity summary ──",
    `Target VUs: ${targetVus}`,
    p95 != null ? `Search p95: ${p95.toFixed(0)}ms (SLO: ${P95_SLO_MS}ms)` : "Search p95: n/a",
    `http_req_failed: ${(data.metrics.http_req_failed?.values?.rate * 100 || 0).toFixed(2)}%`,
    "",
    "Interpretation: last step where p95 < 3000ms ≈ sustainable in-flight capacity per pod.",
    "",
  ];

  return {
    stdout: lines.join("\n"),
  };
}
