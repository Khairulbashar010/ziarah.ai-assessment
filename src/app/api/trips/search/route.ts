import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { tripSearchRequestSchema } from "@/lib/api/trip-search-request";
import { searchTrip, QuorumError } from "@/lib/orchestration/trip-search-service";
import { toClientTripResponse } from "@/lib/trip-search/client-payload";
import { withTimeout } from "@/lib/resilience/with-timeout";

const GLOBAL_TIMEOUT_MS = Number(process.env.GLOBAL_TIMEOUT_MS ?? 60_000);

export async function POST(request: NextRequest) {
  const started = Date.now();

  try {
    const body = await request.json();
    const { query, context } = tripSearchRequestSchema.parse(body);
    const requestId = request.headers.get("x-request-id") ?? uuidv4();

    const result = await withTimeout(
      searchTrip(query, requestId, context),
      GLOBAL_TIMEOUT_MS,
      "Global",
    );
    return NextResponse.json(toClientTripResponse(result));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request body", details: error.flatten() },
        { status: 400 },
      );
    }

    if (error instanceof QuorumError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }

    if (error instanceof Error && error.message.includes("parse")) {
      return NextResponse.json({ error: "Could not parse travel query" }, { status: 422 });
    }

    if (error instanceof Error && error.message.includes("Global timed out")) {
      return NextResponse.json(
        { error: "Request timed out", durationMs: Date.now() - started },
        { status: 504 },
      );
    }

    console.error("Trip search error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
