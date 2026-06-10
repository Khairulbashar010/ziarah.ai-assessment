import { NextResponse } from "next/server";
import { getProviderMockStatus } from "@/lib/providers/provider-mode";

export async function GET() {
  const providerMocks = getProviderMockStatus();

  return NextResponse.json({
    status: "ok",
    service: "ziarah-trip-search",
    timestamp: new Date().toISOString(),
    mockProviders: process.env.MOCK_PROVIDERS !== "false",
    providerMocks,
    mockLlm: process.env.MOCK_LLM === "true",
  });
}
