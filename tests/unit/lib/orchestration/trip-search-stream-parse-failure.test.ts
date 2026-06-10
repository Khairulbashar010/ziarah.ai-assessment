import { describe, it, expect, vi } from "vitest";
import { searchTripStream } from "@/lib/orchestration/trip-search-service";

vi.mock("@/lib/llm/parse-trip-query", () => ({
  streamParseTripQuery: vi.fn(async function* () {
    yield { type: "status", message: "Understanding your trip...", progress: 10 };
  }),
  parseTripQuery: vi.fn(),
  formatParsedSummary: vi.fn(),
}));

describe("searchTripStream parse guard", () => {
  it("throws when parsing completes without structured params", async () => {
    const error = await (async () => {
      for await (const _event of searchTripStream("any query", "req-parse-fail")) {
        // drain
      }
    })().catch((caught) => caught);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/parse travel query/i);
  });
});
