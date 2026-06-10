import http from "k6/http";
import { check, sleep } from "k6";
import { searchThresholds, searchUrl } from "./lib/config.js";
import { randomQuery, searchBody } from "./lib/queries.js";

const rampVus = Number(__ENV.K6_RAMP_VUS || 10);
const targetVus = Number(__ENV.K6_TARGET_VUS || 50);
const holdDuration = __ENV.K6_HOLD_DURATION || "2m";

export const options = {
  scenarios: {
    search_sync: {
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
  thresholds: searchThresholds,
};

export default function () {
  const res = http.post(searchUrl(), searchBody(randomQuery()), {
    headers: {
      "Content-Type": "application/json",
      "X-Request-Id": `k6-${__VU}-${__ITER}`,
    },
    tags: { endpoint: "search" },
    timeout: "10s",
  });

  check(res, {
    "status is 200": (r) => r.status === 200,
    "has flights or hotels": (r) => {
      try {
        const body = JSON.parse(r.body);
        return (
          (body.flights?.offers?.length ?? 0) > 0 ||
          (body.hotels?.offers?.length ?? 0) > 0
        );
      } catch {
        return false;
      }
    },
  });

  sleep(Math.random() * 0.3);
}
