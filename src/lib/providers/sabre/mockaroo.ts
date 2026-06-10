import mockarooSchema from "@/mocks/schemas/sabre-bfm-mockaroo.schema.json";

export type MockarooSabreItinerarySeed = {
  carrier: string;
  flightNumber: number;
  baseFarePerPax: number;
  taxPerPax: number;
  outboundElapsed: number;
  returnElapsed: number;
  stops: number;
  equipment: string;
};

const MOCKAROO_API_URL = "https://api.mockaroo.com/api/generate.json";

export async function fetchMockarooSabreSeeds(
  count: number,
): Promise<MockarooSabreItinerarySeed[] | null> {
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
    throw new Error(`Mockaroo Sabre seed fetch failed (${response.status}): ${body}`);
  }

  return (await response.json()) as MockarooSabreItinerarySeed[];
}
