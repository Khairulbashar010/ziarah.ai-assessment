import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { NextRequest } from "next/server";
import { POST } from "@/app/api/trips/search/stream/route";
import { QuorumError } from "@/lib/orchestration/trip-search-service";
import type { TripSearchStreamEvent } from "@/lib/trip-search/stream-events";
import { USER_ERRORS } from "@/lib/user-messages";

const { searchTripStreamMock } = vi.hoisted(() => ({
  searchTripStreamMock: vi.fn(),
}));

vi.mock("@/lib/orchestration/trip-search-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/orchestration/trip-search-service")>();
  return {
    ...actual,
    searchTripStream: searchTripStreamMock,
  };
});

function makeRequest(body: unknown): NextRequest {
  return new Request("http://localhost/api/trips/search/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as NextRequest;
}

async function readSseEvents(response: Response): Promise<TripSearchStreamEvent[]> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const events: TripSearchStreamEvent[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";
    for (const chunk of chunks) {
      const line = chunk.split("\n").find((entry) => entry.startsWith("data:"));
      if (line) {
        events.push(JSON.parse(line.slice(5).trim()) as TripSearchStreamEvent);
      }
    }
  }

  return events;
}

describe("POST /api/trips/search/stream", () => {
  beforeEach(() => {
    searchTripStreamMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("streams SSE events on success", async () => {
    async function* mockStream() {
      yield { type: "status" as const, message: "Searching...", progress: 50 };
      yield {
        type: "complete" as const,
        result: {
          requestId: "stream-req",
          parsedQuery: {},
          meta: {},
          providers: {},
          flights: { totalOffers: 0, withinBudget: true, offers: [] },
          hotels: { totalOffers: 0, offers: [] },
          tripSummary: {},
        },
      };
    }
    searchTripStreamMock.mockReturnValue(mockStream());

    const response = await POST(
      makeRequest({ query: "family of 4 from Dubai to London, December 20-27" }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/event-stream");
    expect(response.headers.get("X-Request-Id")).toBeTruthy();

    const events = await readSseEvents(response);
    expect(events).toHaveLength(2);
    expect(events[0].type).toBe("status");
    expect(events[1].type).toBe("complete");
  });

  it("emits error event for QuorumError inside the stream", async () => {
    async function* failingStream() {
      throw new QuorumError({
        requestId: "req-q",
        providersSucceeded: 0,
        providersRequired: 2,
        providerTimeoutMs: 2500,
        route: "DXB → LON",
        providers: {
          sabre: { domain: "flights", status: "error", offerCount: 0, durationMs: 1 },
          amadeus: { domain: "flights", status: "error", offerCount: 0, durationMs: 1 },
          hotelbeds: { domain: "hotels", status: "error", offerCount: 0, durationMs: 1 },
        },
      });
      yield { type: "status" as const, message: "never", progress: 0 };
    }
    searchTripStreamMock.mockReturnValue(failingStream());

    const response = await POST(
      makeRequest({ query: "family of 4 from Dubai to London, December 20-27" }),
    );
    const events = await readSseEvents(response);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("error");
    if (events[0].type === "error") {
      expect(events[0].status).toBe(503);
      expect(events[0].message).toBe(USER_ERRORS.quorum);
    }
  });

  it("emits error event for generic failures inside the stream", async () => {
    async function* genericFailStream() {
      throw new Error("internal server error");
      yield { type: "status" as const, message: "never", progress: 0 };
    }
    searchTripStreamMock.mockReturnValue(genericFailStream());

    const response = await POST(
      makeRequest({ query: "family of 4 from Dubai to London, December 20-27" }),
    );
    const events = await readSseEvents(response);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("error");
    if (events[0].type === "error") {
      expect(events[0].status).toBe(500);
      expect(events[0].message).toBe(USER_ERRORS.generic);
    }
  });

  it("emits error event for parse failures inside the stream", async () => {
    async function* parseFailStream() {
      throw new Error("Could not parse travel query");
      yield { type: "status" as const, message: "never", progress: 0 };
    }
    searchTripStreamMock.mockReturnValue(parseFailStream());

    const response = await POST(
      makeRequest({ query: "family of 4 from Dubai to London, December 20-27" }),
    );
    const events = await readSseEvents(response);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("error");
    if (events[0].type === "error") {
      expect(events[0].status).toBe(422);
      expect(events[0].message).toBe(USER_ERRORS.parse);
    }
  });

  it("returns 400 for invalid request body (Zod)", async () => {
    const response = await POST(makeRequest({ query: "no" }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe(USER_ERRORS.parse);
    expect(searchTripStreamMock).not.toHaveBeenCalled();
  });

  it("returns 500 when request parsing throws unexpectedly", async () => {
    const badRequest = {
      json: async () => {
        throw new Error("broken body");
      },
    } as unknown as NextRequest;

    const response = await POST(badRequest);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("broken body");
  });

  it("emits error event for non-Error failures inside the stream", async () => {
    async function* nonErrorFailStream() {
      throw "provider blew up";
      yield { type: "status" as const, message: "never", progress: 0 };
    }
    searchTripStreamMock.mockReturnValue(nonErrorFailStream());

    const response = await POST(
      makeRequest({ query: "family of 4 from Dubai to London, December 20-27" }),
    );
    const events = await readSseEvents(response);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("error");
    if (events[0].type === "error") {
      expect(events[0].status).toBe(500);
      expect(events[0].message).toBe(USER_ERRORS.generic);
    }
  });
});
