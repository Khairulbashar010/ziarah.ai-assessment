import { describe, expect, it, vi } from "vitest";
import { classifyChatIntent } from "@/lib/llm/chat-intent";
import type { TripSearchParams } from "@/lib/types/trip";
import * as parseFromToModule from "@/lib/utils/parse-from-to";

const dubaiLondon: TripSearchParams = {
  flights: {
    origin: "DXB",
    destination: "LON",
    departureDate: "2026-12-20",
    returnDate: "2026-12-27",
    passengers: { adults: 2, children: 2, infants: 0 },
    cabin: "ECONOMY",
  },
  hotels: {
    destination: "London",
    destinationCode: "LON",
    checkIn: "2026-12-20",
    checkOut: "2026-12-27",
    occupancies: [{ rooms: 1, adults: 2, children: 2, childAges: [8, 9] }],
  },
  budget: { maxTotal: 5000, currency: "USD" },
  tripType: "ROUND_TRIP",
};

describe("classifyChatIntent", () => {
  it("treats first message as a new search", () => {
    expect(classifyChatIntent("family of 4 from Dubai to London", null)).toBe("new_search");
  });

  it("detects budget and date tweaks as modifications", () => {
    expect(classifyChatIntent("increase budget to $8000", dubaiLondon)).toBe("modify");
    expect(classifyChatIntent("change dates to December 25-30", dubaiLondon)).toBe("modify");
    expect(classifyChatIntent("make it 5 people", dubaiLondon)).toBe("modify");
  });

  it("detects a different route as a new search", () => {
    expect(classifyChatIntent("from Dubai to Paris instead", dubaiLondon)).toBe("new_search");
    expect(classifyChatIntent("start over — family of 2 from NYC to Tokyo", dubaiLondon)).toBe(
      "new_search",
    );
  });

  it("treats empty follow-ups as modifications", () => {
    expect(classifyChatIntent("   ", dubaiLondon)).toBe("modify");
  });

  it("detects explicit new-trip phrases", () => {
    expect(classifyChatIntent("start over", dubaiLondon)).toBe("new_search");
    expect(classifyChatIntent("plan something else", dubaiLondon)).toBe("new_search");
  });

  it("treats same-route IATA phrasing as a modification", () => {
    expect(classifyChatIntent("from DXB to LON", dubaiLondon)).toBe("modify");
  });

  it("detects bare budget amounts and traveler counts", () => {
    expect(classifyChatIntent("$8k", dubaiLondon)).toBe("modify");
    expect(classifyChatIntent("3 people", dubaiLondon)).toBe("modify");
    expect(classifyChatIntent("2 adults", dubaiLondon)).toBe("modify");
  });

  it("detects preference tweaks as modifications", () => {
    expect(classifyChatIntent("non-stop only", dubaiLondon)).toBe("modify");
    expect(classifyChatIntent("refundable tickets", dubaiLondon)).toBe("modify");
    expect(classifyChatIntent("cheapest options", dubaiLondon)).toBe("modify");
    expect(classifyChatIntent("4 star hotels", dubaiLondon)).toBe("modify");
  });

  it("treats short ambiguous follow-ups as modifications", () => {
    expect(classifyChatIntent("sounds good", dubaiLondon)).toBe("modify");
  });

  it("ignores very short route fragments that do not look like real cities", () => {
    expect(classifyChatIntent("from NY to LA", dubaiLondon)).toBe("modify");
  });

  it("treats long unrelated messages as new searches", () => {
    const longMessage =
      "I was thinking about something completely different for next summer with a totally new destination and group size that does not mention any budget or dates from the current trip context at all.";
    expect(classifyChatIntent(longMessage, dubaiLondon)).toBe("new_search");
  });

  it("detects bare month and budget phrasing as modifications", () => {
    expect(classifyChatIntent("December", dubaiLondon)).toBe("modify");
    expect(classifyChatIntent("under $8000", dubaiLondon)).toBe("modify");
    expect(classifyChatIntent("budget $4000", dubaiLondon)).toBe("modify");
  });

  it("detects family-size follow-ups without route keywords", () => {
    expect(classifyChatIntent("family of 6", dubaiLondon)).toBe("modify");
  });

  it("detects explicit forget-this-trip signals", () => {
    expect(classifyChatIntent("forget this", dubaiLondon)).toBe("new_search");
    expect(classifyChatIntent("scratch that", dubaiLondon)).toBe("new_search");
  });

  it("detects origin-only route changes as a new search", () => {
    expect(classifyChatIntent("from Paris to London", dubaiLondon)).toBe("new_search");
  });

  it("treats IATA route phrasing as a modification when the route is unchanged", () => {
    expect(classifyChatIntent("from DXB to LON", dubaiLondon)).toBe("modify");
  });

  it("treats decrease and adjust phrasing as modifications", () => {
    expect(classifyChatIntent("decrease budget to $2000", dubaiLondon)).toBe("modify");
    expect(classifyChatIntent("adjust the budget to $4000", dubaiLondon)).toBe("modify");
    expect(classifyChatIntent("make it 3 people", dubaiLondon)).toBe("modify");
  });

  it("detects one-stop and multi-stop preference tweaks", () => {
    expect(classifyChatIntent("one stop only", dubaiLondon)).toBe("modify");
    expect(classifyChatIntent("2 stops is fine", dubaiLondon)).toBe("modify");
  });

  it("treats route follow-ups as modifications when route parsing fails internally", () => {
    const spy = vi
      .spyOn(parseFromToModule, "parseFromTo")
      .mockReturnValueOnce({ origin: "Dubai", destination: "London" })
      .mockReturnValueOnce(null);

    expect(classifyChatIntent("from Dubai to London", dubaiLondon)).toBe("modify");

    spy.mockRestore();
  });
});
