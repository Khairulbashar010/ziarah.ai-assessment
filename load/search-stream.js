import http from "k6/http";
import { check, sleep } from "k6";
import { Trend } from "k6/metrics";
import { streamThresholds, streamUrl } from "./lib/config.js";
import { randomQuery, searchBody } from "./lib/queries.js";

const searchStreamDuration = new Trend("search_stream_duration", true);

const rampVus = Number(__ENV.K6_RAMP_VUS || 10);
const targetVus = Number(__ENV.K6_TARGET_VUS || 30);
const holdDuration = __ENV.K6_HOLD_DURATION || "2m";

export const options = {
  scenarios: {
    search_stream: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: rampVus },
        { duration: "1m", target: targetVus },
        { duration: holdDuration, target: targetVus },
        { duration: "30s", target: 0 },
      ],
      gracefulRampDown: "30s",
    },
  },
  thresholds: streamThresholds,
};

export default function () {
  const started = Date.now();

  const res = http.post(streamUrl(), searchBody(randomQuery()), {
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      "X-Request-Id": `k6-stream-${__VU}-${__ITER}`,
    },
    tags: { endpoint: "search-stream" },
    timeout: "15s",
  });

  const durationMs = Date.now() - started;
  searchStreamDuration.add(durationMs);

  check(res, {
    "status is 200": (r) => r.status === 200,
    "content-type is SSE": (r) =>
      (r.headers["Content-Type"] || "").includes("text/event-stream"),
    "has complete event": (r) => r.body && r.body.includes('"type":"complete"'),
    "within SLO": () => durationMs < 3000,
  });

  sleep(Math.random() * 0.3);
}
