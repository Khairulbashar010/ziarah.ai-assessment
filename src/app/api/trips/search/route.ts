import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { tripSearchRequestSchema } from "@/lib/api/trip-search-request";
import { resolveRequestId } from "@/lib/api/request-id";
import { searchTrip, QuorumError } from "@/lib/orchestration/trip-search-service";
import { toClientTripResponse } from "@/lib/trip-search/client-payload";
import { withTimeout } from "@/lib/resilience/with-timeout";
import { toUserErrorMessage } from "@/lib/user-messages";

const GLOBAL_TIMEOUT_MS = Number(process.env.GLOBAL_TIMEOUT_MS ?? 60_000);

export async function POST(request: NextRequest) {
  const started = Date.now();

  try {
    const body = await request.json();
    const { query, context } = tripSearchRequestSchema.parse(body);
    const requestId = resolveRequestId(request.headers.get("x-request-id"));

    const result = await withTimeout(
      searchTrip(query, requestId, context),
      GLOBAL_TIMEOUT_MS,
      "Global",
    );
    return NextResponse.json(toClientTripResponse(result));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: toUserErrorMessage("Invalid request body", 400) },
        { status: 400 },
      );
    }

    if (error instanceof QuorumError) {
      return NextResponse.json(
        { error: toUserErrorMessage(error.message, 503) },
        { status: 503 },
      );
    }

    if (error instanceof Error && error.message.includes("parse")) {
      return NextResponse.json(
        { error: toUserErrorMessage(error.message, 422) },
        { status: 422 },
      );
    }

    if (error instanceof Error && error.message.includes("Global timed out")) {
      return NextResponse.json(
        { error: toUserErrorMessage(error.message, 504) },
        { status: 504 },
      );
    }

    console.error("Trip search error:", error);
    return NextResponse.json(
      { error: toUserErrorMessage(error, 500) },
      { status: 500 },
    );
  }
}
