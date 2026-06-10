# Design docs

System design for the Ziarah trip search service: natural-language query in, parallel Sabre/Amadeus/HotelBeds calls out, unified ranked offers back.

Start with **system-design.md**. The other files go deeper on one topic each and are meant to be read when you need that detail, not cover to cover.

| Doc | What's in it |
|-----|----------------|
| [system-design.md](./system-design.md) | Architecture, API surface, failure handling, ops assumptions |
| [architecture.md](./architecture.md) | Module layout, data flow, cache layers |
| [api-contract.md](./api-contract.md) | Request/response shapes, SSE events, error codes |
| [resilience.md](./resilience.md) | Timeouts, circuit breakers, quorum, what we don't retry |
| [observability.md](./observability.md) | Logging/metrics/tracing plan and current gaps |
| [kubernetes.md](./kubernetes.md) | K8s manifests, scaling math, Redis cutover |

Runnable app setup lives in the repo [README](../README.md). Provider API notes are under `docs/`.

**PDF:** `npx md-to-pdf design-docs/system-design.md`
