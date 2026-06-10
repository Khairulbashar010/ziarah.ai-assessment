import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { tripSearchRequestSchema } from "@/lib/api/trip-search-request";
import { resolveRequestId } from "@/lib/api/request-id";
import { searchTrip, QuorumError } from "@/lib/orchestration/trip-search-service";
import { toClientTripResponse } from "@/lib/trip-search/client-payload";
import { withTimeout } from "@/lib/resilience/with-timeout";
import { toUserErrorMessage } from "@/lib/user-messages";
import { API_ROUTES } from "@/lib/observability/api-routes";
import {
  logApiError,
  logSearchComplete,
  logSearchStart,
  requestLogger,
} from "@/lib/observability/logger";
import {
  finalizeSearchMetrics,
  runSearchWithTelemetry,
} from "@/lib/observability/search-request-telemetry";

const GLOBAL_TIMEOUT_MS = Number(process.env.GLOBAL_TIMEOUT_MS ?? 3000);
const ROUTE = API_ROUTES.search;

export async function POST(request: NextRequest) {
  const started = Date.now();
  let requestId = resolveRequestId(request.headers?.get("x-request-id") ?? null);
  let log = requestLogger(requestId, ROUTE);

  try {
    const body = await request.json();
    const { query, context } = tripSearchRequestSchema.parse(body);
    requestId = resolveRequestId(request.headers?.get("x-request-id") ?? null);
    log = requestLogger(requestId, ROUTE);

    logSearchStart(log, { queryLength: query.length, hasContext: Boolean(context) });

    let result;
    await runSearchWithTelemetry({
      route: ROUTE,
      requestId,
      headers: request.headers,
      run: async () => {
        result = await withTimeout(
          searchTrip(query, requestId, context),
          GLOBAL_TIMEOUT_MS,
          "Global",
        );
      },
    });

    logSearchComplete(log, {
      durationMs: Date.now() - started,
      statusCode: 200,
      cacheStatus: result!.meta.cache.status,
      providersSucceeded: result!.meta.providersSucceeded,
    });
    finalizeSearchMetrics({
      route: ROUTE,
      statusCode: 200,
      started,
      cacheStatus: result!.meta.cache.status,
    });

    return NextResponse.json(toClientTripResponse(result!));
  } catch (error) {
    const durationMs = Date.now() - started;

    if (error instanceof z.ZodError) {
      logApiError(log, {
        event: "validation_error",
        statusCode: 400,
        durationMs,
        err: error,
        message: "invalid request body",
      });
      finalizeSearchMetrics({ route: ROUTE, statusCode: 400, started });
      return NextResponse.json(
        { error: toUserErrorMessage("Invalid request body", 400) },
        { status: 400 },
      );
    }

    if (error instanceof QuorumError) {
      logApiError(log, {
        event: "quorum_failure",
        statusCode: 503,
        durationMs,
        message: error.message,
      });
      finalizeSearchMetrics({ route: ROUTE, statusCode: 503, started });
      return NextResponse.json(
        { error: toUserErrorMessage(error.message, 503) },
        { status: 503 },
      );
    }

    if (error instanceof Error && error.message.includes("parse")) {
      logApiError(log, {
        event: "parse_error",
        statusCode: 422,
        durationMs,
        err: error,
        message: "trip query parse failed",
      });
      finalizeSearchMetrics({ route: ROUTE, statusCode: 422, started });
      return NextResponse.json(
        { error: toUserErrorMessage(error.message, 422) },
        { status: 422 },
      );
    }

    if (error instanceof Error && error.message.includes("Global timed out")) {
      logApiError(log, {
        event: "global_timeout",
        statusCode: 504,
        durationMs,
        err: error,
        message: "trip search global timeout",
      });
      finalizeSearchMetrics({ route: ROUTE, statusCode: 504, started });
      return NextResponse.json(
        { error: toUserErrorMessage(error.message, 504) },
        { status: 504 },
      );
    }

    logApiError(log, {
      event: "internal_error",
      statusCode: 500,
      durationMs,
      err: error,
      message: "unhandled trip search error",
    });
    finalizeSearchMetrics({ route: ROUTE, statusCode: 500, started });
    return NextResponse.json(
      { error: toUserErrorMessage(error, 500) },
      { status: 500 },
    );
  }
}
