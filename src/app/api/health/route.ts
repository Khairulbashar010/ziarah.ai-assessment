import { NextResponse } from "next/server";
import { setRedisConnectionUp } from "@/lib/observability/metrics";
import { getProviderMockStatus } from "@/lib/providers/provider-mode";
import { pingRedis } from "@/lib/storage/redis";

export async function GET() {
  const providerMocks = getProviderMockStatus();
  const redisOk = await pingRedis();
  setRedisConnectionUp(redisOk);

  return NextResponse.json(
    {
      status: redisOk ? "ok" : "degraded",
      service: "ziarah-trip-search",
      timestamp: new Date().toISOString(),
      redis: redisOk ? "ok" : "error",
      mockProviders: process.env.MOCK_PROVIDERS !== "false",
      providerMocks,
      mockLlm: process.env.MOCK_LLM === "true",
    },
    { status: redisOk ? 200 : 503 },
  );
}
