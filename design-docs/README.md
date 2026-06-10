# Design docs

Engineering reference for the Ziarah trip search service.

**In one sentence:** a user types a trip in plain English → we parse it → call Sabre, Amadeus, and HotelBeds in parallel → return ranked flights and hotels.

---

## New here? Read in this order

1. **[system-design.md](./system-design.md)** — the full picture: request flow, API, failures, deployment targets.
2. **[architecture.md](./architecture.md)** — where the code lives and how data moves through it.
3. Pick one topic when you need it:
   - Calling the API → [api-contract.md](./api-contract.md)
   - Timeouts, retries, circuit breakers → [resilience.md](./resilience.md)
   - Logs and dashboards → [observability.md](./observability.md)
   - Production scaling math → [kubernetes.md](./kubernetes.md)

You do **not** need to read every file cover to cover.

---

## Doc index

| Doc | What's in it |
|-----|----------------|
| [system-design.md](./system-design.md) | End-to-end design — architecture, API, failure handling, deployment |
| [architecture.md](./architecture.md) | Code layout, data flow, caching, service boundary |
| [api-contract.md](./api-contract.md) | Request/response shapes, SSE events, error codes |
| [resilience.md](./resilience.md) | Timeouts, circuit breakers, quorum, one-shot retry |
| [observability.md](./observability.md) | What's implemented today (logs) + production roadmap (metrics, traces) |
| [kubernetes.md](./kubernetes.md) | Production topology, HPA, example manifests, Redis |

Runnable setup, load tests, and the Docker Compose log stack: [README](../README.md) and [load/README.md](../load/README.md).

---

## Terms you'll see

| Term | Meaning |
|------|---------|
| **GDS** | Global Distribution System — airline inventory APIs (Sabre, Amadeus) |
| **Provider** | Any upstream we call: Sabre, Amadeus, or HotelBeds |
| **Quorum** | At least **2 of 3** providers must respond successfully, or the search fails with HTTP 503 |
| **SSE** | Server-Sent Events — the stream endpoint pushes JSON events to the browser as work completes |
| **Sync** | The non-streaming `POST /api/trips/search` endpoint — one JSON response at the end |
| **p95** | 95th percentile latency — 95% of requests finish faster than this number |
| **SLO** | Service Level Objective — the target we test against (here: p95 &lt; 3s on cache miss) |
| **SWR** | Stale-while-revalidate — return cached data immediately, refresh in the background |
| **VU** | Virtual user — one simulated client in a k6 load test |
| **HPA** | Horizontal Pod Autoscaler — Kubernetes adds/removes pods based on load |

**PDF export:** `npx md-to-pdf design-docs/system-design.md`
