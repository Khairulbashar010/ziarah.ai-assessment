import http from "k6/http";
import { check, sleep } from "k6";
import { healthUrl, searchUrl } from "./lib/config.js";
import { randomQuery, searchBody } from "./lib/queries.js";

export const options = {
  vus: 2,
  duration: "15s",
  thresholds: {
    http_req_failed: ["rate<0.01"],
    checks: ["rate>0.99"],
  },
};

export default function () {
  const health = http.get(healthUrl(), { tags: { endpoint: "health" } });
  check(health, {
    "health status 200": (r) => r.status === 200,
    "health redis ok": (r) => {
      try {
        return JSON.parse(r.body).redis === "ok";
      } catch {
        return false;
      }
    },
  });

  const search = http.post(searchUrl(), searchBody(randomQuery()), {
    headers: { "Content-Type": "application/json" },
    tags: { endpoint: "search" },
  });

  check(search, {
    "search status 200": (r) => r.status === 200,
    "search has requestId": (r) => {
      try {
        return Boolean(JSON.parse(r.body).requestId);
      } catch {
        return false;
      }
    },
  });

  sleep(0.5);
}
