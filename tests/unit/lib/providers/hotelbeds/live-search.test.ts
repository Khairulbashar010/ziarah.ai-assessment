import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { searchHotelBedsHotelsLive } from "@/lib/providers/hotelbeds/live-search";

describe("searchHotelBedsHotelsLive", () => {
  const fetchMock = vi.fn();

  const hotelParams = {
    destination: "London",
    destinationCode: "LON",
    checkIn: "2026-12-20",
    checkOut: "2026-12-27",
    occupancies: [{ rooms: 1, adults: 2, children: 0 }],
  };

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("HOTELBEDS_API_KEY", "hb-key");
    vi.stubEnv("HOTELBEDS_API_SECRET", "hb-secret");
    delete process.env.HOTELBEDS_BASE_URL;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("posts availability request with auth headers", async () => {
    const payload = { hotels: { total: 2, hotels: [] } };
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => payload,
    });

    const result = await searchHotelBedsHotelsLive(hotelParams);

    expect(result).toEqual(payload);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://api.test.hotelbeds.com/hotel-api/1.0/hotels",
    );
    expect(fetchMock.mock.calls[0][1]?.headers?.["Api-key"]).toBe("hb-key");
    expect(fetchMock.mock.calls[0][1]?.headers?.["X-Signature"]).toBeTruthy();
  });

  it("uses custom HOTELBEDS_BASE_URL when configured", async () => {
    process.env.HOTELBEDS_BASE_URL = "https://api.hotelbeds.com";
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    await searchHotelBedsHotelsLive(hotelParams);

    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://api.hotelbeds.com/hotel-api/1.0/hotels",
    );
  });

  it("includes child paxes from provided child ages", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    await searchHotelBedsHotelsLive({
      ...hotelParams,
      occupancies: [{ rooms: 1, adults: 2, children: 2, childAges: [6, 10] }],
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.occupancies[0].paxes).toEqual([
      { type: "CH", age: 6 },
      { type: "CH", age: 10 },
    ]);
  });

  it("generates default child ages when childAges are too short", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    await searchHotelBedsHotelsLive({
      ...hotelParams,
      occupancies: [{ rooms: 1, adults: 2, children: 2, childAges: [6] }],
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.occupancies[0].paxes).toEqual([
      { type: "CH", age: 8 },
      { type: "CH", age: 9 },
    ]);
  });

  it("generates default child ages when childAges are missing", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    await searchHotelBedsHotelsLive({
      ...hotelParams,
      occupancies: [{ rooms: 1, adults: 2, children: 2 }],
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.occupancies[0].paxes).toEqual([
      { type: "CH", age: 8 },
      { type: "CH", age: 9 },
    ]);
  });

  it("omits paxes when there are no children", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    await searchHotelBedsHotelsLive(hotelParams);

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.occupancies[0].paxes).toBeUndefined();
  });

  it("throws with HotelBeds error payload when request fails", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: { code: "INVALID_DATA" } }),
    });

    await expect(searchHotelBedsHotelsLive(hotelParams)).rejects.toThrow(
      'HotelBeds availability failed (400): {"code":"INVALID_DATA"}',
    );
  });

  it("stringifies non-error failure payloads", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => "unavailable",
    });

    await expect(searchHotelBedsHotelsLive(hotelParams)).rejects.toThrow(
      'HotelBeds availability failed (503): "unavailable"',
    );
  });
});
