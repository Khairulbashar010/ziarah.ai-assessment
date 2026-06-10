# Ziarah Trip Search Service

Engineering assessment submission for [Ziarah.ai](https://ziarah.ai) — a conversational trip search service that aggregates **Sabre** and **Amadeus** flights with **HotelBeds** hotels from a single natural-language query.

## Airport data

`src/data/airports-index.json` — compact airport lookup (IATA codes, coordinates, cities, countries). Used for city resolution and route display.

## Quick start

```bash
npm install
cp .env.example .env
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and try:


> family of 4 from Dubai to London, December 20-27, budget $3000

## Docker

Configure variables in `.env` (see `.env.example`), then:

```bash
docker compose up --build
```

Docker Compose loads all settings from `.env` — nothing is hardcoded in the image.

## API

### `POST /api/trips/search`

```bash
curl -X POST http://localhost:3000/api/trips/search \
  -H "Content-Type: application/json" \
  -d '{"query":"family of 4 from Dubai to London, December 20-27, budget $3000"}'
```

Returns unified `flights`, `hotels`, and `tripSummary` with 2-of-3 provider quorum.

### `GET /api/health`

Health check with mock mode flags.

## Architecture

```
NL query → LLM parser → parallel provider fan-out (3) → normalize → trip response
                         ├── Sabre (flights)
                         ├── Amadeus (flights)
                         └── HotelBeds (hotels)
```

- **Quorum:** ≥2 of 3 providers must succeed for HTTP 200
- **Resilience:** Per-provider timeouts (2.5s), circuit breakers, partial results
- **Mocks:** Provider-native JSON shapes per `docs/mock-api-specification.md`

See [`docs/DESIGN.md`](docs/DESIGN.md) for the full system design.

## Tests

```bash
npm test
```

Covers normalization (Sabre, Amadeus, HotelBeds), quorum success/failure, and budget math.

## Project structure

```
src/
├── app/                    # Next.js pages + API routes (thin handlers)
├── components/
│   ├── chat/               # Conversational search UI
│   ├── flights/            # Flight results + flight-card
│   ├── hotels/             # Hotel results + hotel-card
│   ├── trip/               # Trip workspace (results panel, footer, timeline)
│   ├── landing/            # Hero + quick chips
│   ├── layout/             # Sidebar, top bar
│   └── ui/                 # Shared primitives
├── lib/
│   ├── api/                # Shared API request schemas
│   ├── client/             # Browser-side fetch, filters, budget math
│   ├── orchestration/      # Trip search orchestrator (fan-out, quorum)
│   ├── trip-search/        # Response shaping, ranking, SSE events
│   ├── storage/            # In-memory cache + result store
│   ├── llm/                # NL query parser + chat intent
│   ├── providers/          # Sabre, Amadeus, HotelBeds adapters
│   ├── normalization/      # Provider JSON → unified offers
│   ├── geo/                # Airport index, routing helpers
│   └── resilience/         # Timeouts, circuit breakers
├── mocks/                  # Deterministic provider mocks + seeds
└── data/                   # Static airport index
```

See [`docs/ARCHITECTURE-REVIEW.md`](docs/ARCHITECTURE-REVIEW.md) for enterprise OTA comparison and refactor roadmap.

## Trade-offs

| Decision | Rationale |
|----------|-----------|
| Modular monolith (Next.js) | Sufficient for 10k concurrent users via horizontal pod scaling |
| HotelBeds for hotels, not flights | Matches Ziarah's product and real provider capabilities |
| `MOCK_LLM=true` by default | Deterministic CI/Docker without OpenAI key; set `MOCK_LLM=false` + `OPENAI_API_KEY` for free-form NL |
| In-memory trip cache | Demo simplicity; production would use Redis |

## With more time

- Real OAuth integrations for Sabre/Amadeus/HotelBeds
- Redis session store + chat history
- Activity & transfer providers
- Booking flow with HotelBeds CheckRate + Sabre revalidate
- OpenTelemetry tracing across provider fan-out
- Rate limiting and API key auth

## Documentation

- [`docs/DESIGN.md`](docs/DESIGN.md) — System design (deliverable)
- [`docs/ASSESSMENT-PLAN.md`](docs/ASSESSMENT-PLAN.md) — Implementation plan
- [`docs/mock-api-specification.md`](docs/mock-api-specification.md) — Provider mock spec
