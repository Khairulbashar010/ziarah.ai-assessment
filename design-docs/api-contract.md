# API Contract

Request and response shapes for the trip search API.

**Source of truth for types:** `src/lib/types/trip.ts`  
**Request validation:** `src/lib/api/trip-search-request.ts`

---

## Quick reference

| Method | Path | What you get back |
|--------|------|-------------------|
| `POST` | `/api/trips/search` | One JSON object when the search finishes (or errors) |
| `POST` | `/api/trips/search/stream` | A stream of JSON events as the search progresses |
| `GET` | `/api/trips/{id}` | A previously stored search result |
| `GET` | `/api/health` | Service health + Redis status |

**Which endpoint should I use?**

- Building the chat UI or anything interactive → **stream**
- Writing tests, curl scripts, or a simple integration → **sync**
- Reloading a past search by ID → **GET by id**

---

## `POST /api/trips/search` (sync)

Waits for the full pipeline, then returns one JSON body. A global timeout applies (`GLOBAL_TIMEOUT_MS`, 3s in prod per `.env.example`).

### Request

```http
POST /api/trips/search HTTP/1.1
Content-Type: application/json
X-Request-Id: 550e8400-e29b-41d4-a716-446655440000
```

```json
{
  "query": "family of 4 from Dubai to London, December 20-27, budget $3000",
  "context": null
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `query` | string | yes | 3–2000 chars |
| `context` | `TripSearchParams` | no | Prior trip for follow-up messages (e.g. "make it $5k") |

### Errors

| Status | Cause | Body example |
|--------|-------|--------------|
| 400 | Zod validation | `{ "error": "Please check your search and try again." }` |
| 422 | Parse failure | `{ "error": "We couldn't understand that trip request." }` |
| 503 | Quorum failure (fewer than 2 of 3 providers succeeded) | `{ "error": "Search providers are temporarily unavailable." }` |
| 504 | Global timeout (may occur during quorum retry) | `{ "error": "Your search took too long. Please try again." }` |
| 500 | Unhandled | `{ "error": "Something went wrong. Please try again." }` |

User-facing strings come from `src/lib/user-messages.ts`. Internal details stay in server logs.

---

## `POST /api/trips/search/stream` (SSE)

Same request body. Returns **Server-Sent Events** — the server pushes JSON messages to the client as work completes. This is what the chat UI uses.

**No global timeout** on this route. Each provider is still capped at `PROVIDER_TIMEOUT_MS` (attempt 1) and `PROVIDER_RETRY_TIMEOUT_MS` (attempt 2).

### Response headers

```http
Content-Type: text/event-stream
Cache-Control: no-cache
X-Request-Id: 550e8400-e29b-41d4-a716-446655440000
X-Duration-Ms: 1842
```

Each event is one line: `data: {JSON}\n\n`

### Event types

```typescript
type TripSearchStreamEvent =
  | { type: "status"; message: string; progress?: number }
  | { type: "parse_delta"; text: string }
  | { type: "parsed"; params: TripSearchParams }
  | { type: "provider"; provider: "sabre" | "amadeus" | "hotelbeds"; status: ProviderStatus }
  | { type: "offers_update"; update: TripOffersUpdate }
  | { type: "complete"; result: TripSearchResponse }
  | { type: "error"; message: string; status?: number };
```

| Event | When it fires | What to do |
|-------|---------------|------------|
| `status` | Progress updates | Show a loading message |
| `parsed` | Query understood | Optional — show parsed params |
| `provider` | One provider finished | Show per-provider status |
| `offers_update` | Offers changed | Re-render flight/hotel lists |
| `complete` | Search done | Final result in `result` field |
| `error` | Fatal failure | Show error message |

### Example stream

```
data: {"type":"status","message":"Understanding your trip...","progress":10}

data: {"type":"parsed","params":{"tripType":"ROUND_TRIP","flights":{...},"hotels":{...}}}

data: {"type":"provider","provider":"sabre","status":{"domain":"flights","status":"success","offerCount":42,"durationMs":1200}}

data: {"type":"offers_update","update":{"meta":{...},"flights":{...},"hotels":{...},"tripSummary":{...}}}

data: {"type":"status","message":"Retrying unavailable providers...","progress":90}

data: {"type":"provider","provider":"amadeus","status":{"domain":"flights","status":"success","offerCount":18,"durationMs":620}}

data: {"type":"offers_update","update":{"meta":{...},"flights":{...},"hotels":{...},"tripSummary":{...}}}

data: {"type":"complete","result":{...}}
```

The `Retrying unavailable providers...` status only appears when attempt 1 misses quorum and `PROVIDER_QUORUM_RETRY` is enabled. If the same provider name appears twice, treat the second event as the updated status from attempt 2.

Validation errors before the stream opens return `400` JSON, not SSE.

---

## `GET /api/trips/{id}`

Returns a stored `TripSearchResponse` for `requestId`.

- `200` — found
- `404` — `{ "error": "Trip not found" }`

Stored in Redis (`trip:result:{requestId}`, 1h TTL). Shared across pods.

---

## `GET /api/health`

Used by Kubernetes probes.

```json
{
  "status": "ok",
  "service": "ziarah-trip-search",
  "timestamp": "2026-06-10T12:00:00.000Z",
  "redis": "ok",
  "mockProviders": true,
  "providerMocks": { "sabre": true, "amadeus": true, "hotelbeds": true },
  "mockLlm": true
}
```

When Redis is unreachable: `status` is `"degraded"`, `redis` is `"error"`, HTTP 503 — readiness probe fails.

---

## Core types

### `TripSearchParams`

What the LLM (or regex parser) extracts from the user's query.

```typescript
type TripSearchParams = {
  flights: FlightSearchParams;
  hotels: HotelSearchParams;
  budget?: BudgetParams;
  tripType: "ONE_WAY" | "ROUND_TRIP";
  preferences?: TripSearchPreferences;
};

type FlightSearchParams = {
  origin: string;           // IATA, e.g. "DXB"
  destination: string;
  departureDate: string;    // ISO date
  returnDate?: string;
  passengers: { adults: number; children: number; infants: number };
  cabin: "ECONOMY" | "PREMIUM_ECONOMY" | "BUSINESS" | "FIRST";
  nonStop?: boolean;
};

type HotelSearchParams = {
  destination: string;
  destinationCode: string;  // IATA city code
  checkIn: string;
  checkOut: string;
  occupancies: { rooms: number; adults: number; children: number; childAges?: number[] }[];
};

type BudgetParams = {
  maxTotal: number;
  currency: string;
};
```

### `PublicFlightOffer`

Stripped of `raw` before leaving the server.

```typescript
type PublicFlightOffer = {
  id: string;
  provider: "sabre" | "amadeus";
  totalPrice: number;
  currency: string;
  perPassenger: number;
  validatingCarrier: string;
  stops: number;
  durationMinutes: number;
  segments: {
    origin: string;
    destination: string;
    departure: string;
    arrival: string;
    carrier: string;
    flightNumber: string;
  }[];
  refundable: boolean;
};
```

### `PublicHotelOffer`

```typescript
type PublicHotelOffer = {
  id: string;
  provider: "hotelbeds";
  hotelCode: number;
  hotelName: string;
  destinationCode: string;
  category: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  roomName: string;
  boardName: string;
  totalPrice: number;
  currency: string;
  rateType: "BOOKABLE" | "RECHECK";
  cancellationPolicies: { amount: string; from: string }[];
};
```

### `ProviderStatus`

Per-provider outcome in `meta` and SSE `provider` events.

```typescript
type ProviderStatus = {
  domain: "flights" | "hotels";
  status: "success" | "error" | "timeout" | "pending";
  offerCount: number;
  durationMs: number;
  error?: string;
};
```

### `TripSearchMeta`

```typescript
type TripSearchMeta = {
  durationMs: number;
  providersQueried: number;
  providersSucceeded: number;
  providersFailed: number;
  partialResults: boolean;   // true when 2/3 providers succeeded (one failed)
  cache: {
    status: "fresh" | "stale" | "miss" | "refreshing";
    cachedAt: string | null;
    expiresAt: string | null;
    refreshInMs: number | null;
    ttlMs: number;
  };
};
```

### `TripSummary`

```typescript
type TripSummary = {
  cheapestFlight: number | null;
  cheapestHotel: number | null;
  estimatedTripTotal: number | null;
  currency: string;
  withinBudget: boolean | null;
  budgetRemaining: number | null;
  suggestedMinBudget: number | null;
};
```

---

## Response limits

| Limit | Default | Env |
|-------|---------|-----|
| Max flight offers | 50 | `CLIENT_MAX_FLIGHT_OFFERS` |
| Max hotel offers | 30 | `CLIENT_MAX_HOTEL_OFFERS` |

Full `raw` payloads stay server-side in `TripSearchResult` for booking/replay later.

---

## Versioning

Routes are unversioned (`/api/trips/...`). Breaking schema changes would get a `/api/v1/...` prefix. Additive SSE event types are backward-compatible — clients should ignore unknown `type` values.
