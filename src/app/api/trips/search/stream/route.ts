import { NextRequest } from "next/server";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { tripSearchRequestSchema } from "@/lib/api/trip-search-request";
import { searchTripStream, QuorumError } from "@/lib/orchestration/trip-search-service";
import type { TripSearchStreamEvent } from "@/lib/trip-search/stream-events";
import { toUserErrorMessage } from "@/lib/user-messages";

function encodeSse(event: TripSearchStreamEvent): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
}

export async function POST(request: NextRequest) {
  const started = Date.now();

  try {
    const body = await request.json();
    const { query, context } = tripSearchRequestSchema.parse(body);
    const requestId = request.headers.get("x-request-id") ?? uuidv4();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const event of searchTripStream(query, requestId, context)) {
            controller.enqueue(encodeSse(event));
          }
        } catch (error) {
          const status =
            error instanceof QuorumError
              ? 503
              : error instanceof Error && error.message.includes("parse")
                ? 422
                : 500;

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
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: toUserErrorMessage("Invalid request body", 400) },
        { status: 400 },
      );
    }

    console.error("Trip search stream error:", error);
    return Response.json({ error: toUserErrorMessage(error, 500) }, { status: 500 });
  }
}
