export type ProviderId = "sabre" | "amadeus" | "hotelbeds";

const PROVIDER_ENV_KEYS: Record<ProviderId, string> = {
  sabre: "MOCK_SABRE",
  amadeus: "MOCK_AMADEUS",
  hotelbeds: "MOCK_HOTELBEDS",
};

/** True when this provider should use local mock handlers instead of live APIs. */
export function shouldMockProvider(provider: ProviderId): boolean {
  const override = process.env[PROVIDER_ENV_KEYS[provider]];
  if (override === "true") return true;
  if (override === "false") return false;
  return process.env.MOCK_PROVIDERS !== "false";
}

export function getProviderMockStatus(): Record<ProviderId, boolean> {
  return {
    sabre: shouldMockProvider("sabre"),
    amadeus: shouldMockProvider("amadeus"),
    hotelbeds: shouldMockProvider("hotelbeds"),
  };
}
