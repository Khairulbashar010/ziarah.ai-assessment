/**
 * Diverse trip queries to reduce cache hit dominance during load tests.
 * Each VU picks randomly so concurrent searches spread across cache keys.
 */

/** Budgets are set above typical mock combo prices so k6 checks measure latency, not budget filtering. */
export const QUERIES = [
  "family of 4 from Dubai to London, December 20-27, budget $12000",
  "couple from New York to Paris, March 10-17, budget $12000",
  "solo traveler from Singapore to Tokyo, July 1-8, budget $10000",
  "group of 6 from Sydney to Bali, August 15-22, budget $15000",
  "family of 3 from Toronto to Rome, June 5-12, budget $12000",
  "couple from Berlin to Barcelona, September 1-8, budget $8000",
  "business trip from San Francisco to Chicago, November 3-6, budget $8000",
  "family of 5 from Mumbai to Dubai, January 10-17, budget $12000",
  "friends of 4 from London to Amsterdam, April 20-24, budget $8000",
  "couple from Los Angeles to Cancun, February 14-21, budget $10000",
  "solo from Seoul to Bangkok, May 1-10, budget $8000",
  "family of 4 from Madrid to Lisbon, October 8-15, budget $8000",
];

export function randomQuery() {
  return QUERIES[Math.floor(Math.random() * QUERIES.length)];
}

export function searchBody(query) {
  return JSON.stringify({ query });
}
