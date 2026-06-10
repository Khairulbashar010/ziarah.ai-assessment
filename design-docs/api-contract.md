# API Contract

Request and response shapes for the trip search API. Types: `src/lib/types/trip.ts`. Request validation: `src/lib/api/trip-search-request.ts`.

---

## Endpoints

| Method | Path | Response |
|--------|------|----------|
| `POST` | `/api/trips/search` | `TripSearchResponse` JSON |
| `POST` | `/api/trips/search/stream` | SSE (`text/event-stream`) |
| `GET` | `/api/trips/{id}` | `TripSearchResponse` or 404 |
| `GET` | `/api/health` | `HealthStatus` JSON |

---

## `POST /api/trips/search`

Synchronous search. Global timeout applies (`GLOBAL_TIMEOUT_MS`, 3s in prod per `.env.example`).

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
| `context` | `TripSearchParams` | no | Prior trip for modify/intent |

### Errors

| Status | Cause | Body example |
|--------|-------|--------------|
| 400 | Zod validation | `{ "error": "Please check your search and try again." }` |
| 422 | Parse failure | `{ "error": "We couldn't understand that trip request." }` |
| 503 | Quorum failure | `{ "error": "Search providers are temporarily unavailable." }` |
| 504 | Global timeout | `{ "error": "Your search took too long. Please try again." }` |
| 500 | Unhandled | `{ "error": "Something went wrong. Please try again." }` |

User-facing strings come from `src/lib/user-messages.ts`. Internals stay in server logs.

---

## `POST /api/trips/search/stream`

Same request body. No global timeout; providers still capped at `PROVIDER_TIMEOUT_MS`.

### Response headers

```http
Content-Type: text/event-stream
Cache-Control: no-cache
X-Request-Id: 550e8400-e29b-41d4-a716-446655440000
X-Duration-Ms: 1842
```

Framing: `data: {JSON}\n\n` per event.

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

### Example stream

```
data: {"type":"status","message":"Understanding your trip...","progress":10}

data: {"type":"parsed","params":{"tripType":"ROUND_TRIP","flights":{...},"hotels":{...}}}

data: {"type":"provider","provider":"sabre","status":{"domain":"flights","status":"success","offerCount":42,"durationMs":1200}}

data: {"type":"offers_update","update":{"meta":{...},"flights":{...},"hotels":{...},"tripSummary":{...}}}

data: {"type":"complete","result":{...}}
```

Validation errors before the stream opens return `400` JSON, not SSE.

---

## `GET /api/trips/{id}`

Returns stored `TripSearchResponse` for `requestId`.

- `200` — found
- `404` — `{ "error": "Trip not found" }`

Results are stored in Redis (`trip:result:{requestId}`, 1h TTL). Survives pod restarts and is shared across replicas.

---

## `GET /api/health`

Used by K8s probes.

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

When Redis is unreachable, `status` is `"degraded"`, `redis` is `"error"`, and the response is HTTP 503 — K8s readiness treats this as not ready.

---

## Core types

### `TripSearchParams`

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
  partialResults: boolean;
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

Routes are unversioned (`/api/trips/...`). Breaking schema changes get a `/api/v1/...` prefix. Additive SSE event types are backward-compatible — clients ignore unknown `type` values.
