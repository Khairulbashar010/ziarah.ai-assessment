import type { FlightSearchParams } from "@/lib/types/trip";
import { getSabreAccessToken, getSabrePcc } from "@/lib/providers/sabre/auth";
import { buildSabreBfmRequest } from "@/lib/providers/sabre/bfm-request";

function sabreBaseUrl(): string {
  return process.env.SABRE_ENV === "prod"
    ? "https://api.sabre.com"
    : "https://api.test.sabre.com";
}

export async function searchSabreFlightsLive(params: FlightSearchParams): Promise<unknown> {
  const token = await getSabreAccessToken();
  const body = buildSabreBfmRequest(params, getSabrePcc());

  const response = await fetch(`${sabreBaseUrl()}/v4.3.0/shop/flights?mode=live`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json();

  if (!response.ok) {
    const message =
      typeof payload === "object" && payload !== null && "message" in payload
        ? String((payload as { message: string }).message)
        : JSON.stringify(payload);
    throw new Error(`Sabre BFM failed (${response.status}): ${message}`);
  }

  return payload;
}
