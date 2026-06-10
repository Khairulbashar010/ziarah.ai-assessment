import { NextRequest, NextResponse } from "next/server";
import { toClientTripResponse } from "@/lib/trip-search/client-payload";
import { getTripResult } from "@/lib/storage/trip-results";
import { API_ROUTES } from "@/lib/observability/api-routes";
import { logApiError, requestLogger } from "@/lib/observability/logger";
import { resolveRequestId } from "@/lib/api/request-id";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const started = Date.now();
  const requestId = resolveRequestId(request.headers.get("x-request-id"));
  const log = requestLogger(requestId, API_ROUTES.tripById);

  try {
    const { id } = await params;
    const result = await getTripResult(id);

    if (!result) {
      logApiError(log, {
        event: "trip_not_found",
        statusCode: 404,
        durationMs: Date.now() - started,
        message: "trip result not found",
      });
      return NextResponse.json({ error: "Trip not found" }, { status: 404 });
    }

    return NextResponse.json(toClientTripResponse(result));
  } catch (error) {
    logApiError(log, {
      event: "internal_error",
      statusCode: 500,
      durationMs: Date.now() - started,
      err: error,
      message: "failed to load trip result",
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
