import mockarooSchema from "@/mocks/schemas/hotelbeds-availability-mockaroo.schema.json";

export type MockarooHotelbedsRateSeed = {
  nightlyNet: number;
  taxPerNight: number;
  allotment: number;
  exclusiveDeal: number;
  boardCode: "BB" | "RO" | "HB";
  rateType: "BOOKABLE" | "RECHECK";
  zoneCode: number;
};

const MOCKAROO_API_URL = "https://api.mockaroo.com/api/generate.json";

export async function fetchMockarooHotelbedsSeeds(
  count: number,
): Promise<MockarooHotelbedsRateSeed[] | null> {
  const apiKey = process.env.MOCKAROO_API_KEY?.trim();
  if (!apiKey) return null;

  const url = new URL(MOCKAROO_API_URL);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("count", String(count));

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(mockarooSchema),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Mockaroo HotelBeds seed fetch failed (${response.status}): ${body}`);
  }

  return (await response.json()) as MockarooHotelbedsRateSeed[];
}
