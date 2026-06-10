import { createHash } from "crypto";

function requireHotelBedsCredentials() {
  const apiKey = process.env.HOTELBEDS_API_KEY?.trim();
  const apiSecret = process.env.HOTELBEDS_API_SECRET?.trim();
  const baseUrl = process.env.HOTELBEDS_BASE_URL?.trim() ?? "https://api.test.hotelbeds.com";

  if (!apiKey || !apiSecret) {
    throw new Error("HotelBeds credentials missing: set HOTELBEDS_API_KEY and HOTELBEDS_API_SECRET");
  }

  return { apiKey, apiSecret, baseUrl };
}

export function getHotelBedsBaseUrl(): string {
  return requireHotelBedsCredentials().baseUrl;
}

export function buildHotelBedsAuthHeaders(nowMs = Date.now()): Record<string, string> {
  const { apiKey, apiSecret } = requireHotelBedsCredentials();
  const timestamp = Math.floor(nowMs / 1000);
  const signature = createHash("sha256")
    .update(`${apiKey}${apiSecret}${timestamp}`)
    .digest("hex");

  return {
    "Api-key": apiKey,
    "X-Signature": signature,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}
