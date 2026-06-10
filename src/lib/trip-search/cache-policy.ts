/**
 * GDS price freshness (industry practice, not a single vendor guarantee):
 *
 * - Amadeus Flight Offers Search returns live inventory each call; Amadeus staff
 *   recommend short client-side caches for performance only ([SO 61523411]).
 * - Production integrators commonly cap flight offer caches at 3–5 minutes,
 *   with 5–10 minutes as an upper bound for browse UI before repricing at book.
 * - Hotel live availability is typically more stable; bundled trip search uses the
 *   flight window so prices do not outlive GDS browse expectations.
 *
 * Hotelbeds Cache API files refresh hourly; live Booking API should still be
 * repriced at checkout via CheckRate.
 */
export function tripSearchCacheTtlMs(): number {
  return Number(process.env.TRIP_SEARCH_CACHE_TTL_MS ?? 5 * 60 * 1000);
}
