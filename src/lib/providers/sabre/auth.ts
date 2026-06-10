type SabreTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
};

let cachedToken: { value: string; expiresAt: number } | null = null;

function sabreBaseUrl(): string {
  return process.env.SABRE_ENV === "prod"
    ? "https://api.sabre.com"
    : "https://api.test.sabre.com";
}

function sabreBasicAuth(clientId: string, clientSecret: string): string {
  const encodedId = Buffer.from(clientId).toString("base64");
  const encodedSecret = Buffer.from(clientSecret).toString("base64");
  return Buffer.from(`${encodedId}:${encodedSecret}`).toString("base64");
}

function requireSabreCredentials() {
  const clientId = process.env.SABRE_CLIENT_ID?.trim();
  const clientSecret = process.env.SABRE_CLIENT_SECRET?.trim();
  const pcc = process.env.SABRE_PCC?.trim();

  if (!clientId || !clientSecret) {
    throw new Error("Sabre credentials missing: set SABRE_CLIENT_ID and SABRE_CLIENT_SECRET");
  }

  if (!pcc) {
    throw new Error("Sabre PCC missing: set SABRE_PCC");
  }

  return { clientId, clientSecret, pcc };
}

export function getSabrePcc(): string {
  return requireSabreCredentials().pcc;
}

export async function getSabreAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.value;
  }

  const { clientId, clientSecret } = requireSabreCredentials();
  const response = await fetch(`${sabreBaseUrl()}/v2/auth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${sabreBasicAuth(clientId, clientSecret)}`,
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Sabre auth failed (${response.status}): ${body}`);
  }

  const data = (await response.json()) as SabreTokenResponse;
  const ttlMs = Math.max((data.expires_in - 60) * 1000, 60_000);
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + ttlMs,
  };

  return data.access_token;
}

export function resetSabreTokenCacheForTests() {
  cachedToken = null;
}
