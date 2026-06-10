# Design docs

Engineering reference for the Ziarah trip search service: natural-language query in, parallel Sabre/Amadeus/HotelBeds calls out, unified ranked offers back.

Start with **system-design.md**. The other files go deeper on one topic each — read as needed, not cover to cover.

| Doc | What's in it |
|-----|----------------|
| [system-design.md](./system-design.md) | End-to-end design — architecture, API, failure handling, deployment |
| [architecture.md](./architecture.md) | Code layout, data flow, caching, service boundary |
| [api-contract.md](./api-contract.md) | Request/response shapes, SSE events, error codes |
| [resilience.md](./resilience.md) | Timeouts, circuit breakers, quorum, one-shot retry, degradation |
| [observability.md](./observability.md) | Logs, metrics, traces, alerts — pino, Loki, Prometheus, OTEL |
| [kubernetes.md](./kubernetes.md) | Production topology, HPA, manifests, Redis |

Runnable app setup, load tests, and the Compose observability stack live in the repo [README](../README.md) and [load/README.md](../load/README.md).

**PDF:** `npx md-to-pdf design-docs/system-design.md`
