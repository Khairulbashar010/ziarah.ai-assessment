import { NextRequest } from "next/server";
import { z } from "zod";
import { tripSearchRequestSchema } from "@/lib/api/trip-search-request";
import { resolveRequestId } from "@/lib/api/request-id";
import { searchTripStream, QuorumError } from "@/lib/orchestration/trip-search-service";
import type { TripSearchStreamEvent } from "@/lib/trip-search/stream-events";
import { toUserErrorMessage } from "@/lib/user-messages";
import { API_ROUTES } from "@/lib/observability/api-routes";
import {
  logApiError,
  logSearchComplete,
  logSearchStart,
  requestLogger,
} from "@/lib/observability/logger";

const ROUTE = API_ROUTES.searchStream;

function encodeSse(event: TripSearchStreamEvent): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
}

function resolveStreamErrorStatus(error: unknown): number {
  if (error instanceof QuorumError) return 503;
  if (error instanceof Error && error.message.includes("parse")) return 422;
  return 500;
}

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

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const event of searchTripStream(query, requestId, context)) {
            controller.enqueue(encodeSse(event));
          }

          logSearchComplete(log, {
            durationMs: Date.now() - started,
            statusCode: 200,
          });
        } catch (error) {
          const status = resolveStreamErrorStatus(error);
          const durationMs = Date.now() - started;

          logApiError(log, {
            event:
              status === 503
                ? "quorum_failure"
                : status === 422
                  ? "parse_error"
                  : "internal_error",
            statusCode: status,
            durationMs,
            err: status === 500 ? error : undefined,
            message: error instanceof Error ? error.message : "stream search failed",
          });

          const message = toUserErrorMessage(error, status);

          controller.enqueue(
            encodeSse({
              type: "error",
              message,
              status,
            }),
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Request-Id": requestId,
        "X-Duration-Ms": String(Date.now() - started),
      },
    });
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
      return Response.json(
        { error: toUserErrorMessage("Invalid request body", 400) },
        { status: 400 },
      );
    }

    logApiError(log, {
      event: "internal_error",
      statusCode: 500,
      durationMs,
      err: error,
      message: "trip search stream setup failed",
    });
    return Response.json({ error: toUserErrorMessage(error, 500) }, { status: 500 });
  }
}
