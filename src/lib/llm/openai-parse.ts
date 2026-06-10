import { buildContextualUserMessage, TRIP_PARSE_SYSTEM_PROMPT } from "./parse-instructions";
import { tripSearchParamsSchema } from "./schemas";
import type { TripSearchParams } from "@/lib/types/trip";

type OpenAIChatResponse = {
  choices: Array<{ message: { content: string } }>;
};

const LLM_PARSE_TIMEOUT_MS = Number(process.env.LLM_PARSE_TIMEOUT_MS ?? 12_000);
const LLM_MAX_OUTPUT_TOKENS = 400;

const isoDateSchema = { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" } as const;
const nullableIsoDateSchema = { type: ["string", "null"], pattern: "^\\d{4}-\\d{2}-\\d{2}$" } as const;
const iataCodeSchema = { type: "string", minLength: 3, maxLength: 3 } as const;
const nullableBooleanSchema = { type: ["boolean", "null"] } as const;
const nullableIntegerSchema = { type: ["integer", "null"] } as const;
const nullableAirlinesSchema = {
  type: ["array", "null"],
  items: { type: "string", minLength: 2, maxLength: 2 },
} as const;

const OPENAI_TRIP_SCHEMA = buildOpenAITripSchema();

/** LLM extraction only — output is TripSearchParams, fan-out to Sabre/Amadeus/HotelBeds happens downstream. */
function buildOpenAIRequestBody(
  query: string,
  model: string,
  context?: TripSearchParams | null,
) {
  return {
    model,
    temperature: 0,
    max_tokens: LLM_MAX_OUTPUT_TOKENS,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "trip_search_params",
        strict: true,
        schema: OPENAI_TRIP_SCHEMA,
      },
    },
    messages: [
      { role: "system", content: TRIP_PARSE_SYSTEM_PROMPT },
      { role: "user", content: buildContextualUserMessage(query, context) },
    ],
  };
}

/** JSON Schema payload for OpenAI strict structured outputs (no $schema key). */
export function buildOpenAITripSchema() {
  return {
    type: "object",
    properties: {
      flights: {
        type: "object",
        properties: {
          origin: iataCodeSchema,
          destination: iataCodeSchema,
          departureDate: isoDateSchema,
          returnDate: nullableIsoDateSchema,
          passengers: {
            type: "object",
            properties: {
              adults: { type: "integer", minimum: 1 },
              children: { type: "integer", minimum: 0 },
              infants: { type: "integer", minimum: 0 },
            },
            required: ["adults", "children", "infants"],
            additionalProperties: false,
          },
          cabin: {
            type: "string",
            enum: ["ECONOMY", "PREMIUM_ECONOMY", "BUSINESS", "FIRST"],
          },
          nonStop: nullableBooleanSchema,
        },
        required: [
          "origin",
          "destination",
          "departureDate",
          "returnDate",
          "passengers",
          "cabin",
          "nonStop",
        ],
        additionalProperties: false,
      },
      hotels: {
        type: "object",
        properties: {
          destination: { type: "string" },
          destinationCode: iataCodeSchema,
          checkIn: isoDateSchema,
          checkOut: isoDateSchema,
          occupancies: {
            type: "array",
            items: {
              type: "object",
              properties: {
                rooms: { type: "integer", minimum: 1 },
                adults: { type: "integer", minimum: 1 },
                children: { type: "integer", minimum: 0 },
                childAges: {
                  type: ["array", "null"],
                  items: { type: "integer" },
                },
              },
              required: ["rooms", "adults", "children", "childAges"],
              additionalProperties: false,
            },
          },
        },
        required: ["destination", "destinationCode", "checkIn", "checkOut", "occupancies"],
        additionalProperties: false,
      },
      budget: {
        type: ["object", "null"],
        properties: {
          maxTotal: { type: "number", exclusiveMinimum: 0 },
          currency: { type: "string", minLength: 3, maxLength: 3 },
        },
        required: ["maxTotal", "currency"],
        additionalProperties: false,
      },
      tripType: {
        type: "string",
        enum: ["ONE_WAY", "ROUND_TRIP"],
      },
      preferences: {
        type: ["object", "null"],
        properties: {
          flights: {
            type: ["object", "null"],
            properties: {
              stops: {
                type: ["string", "null"],
                enum: ["any", "direct", "1", "2plus", null],
              },
              sort: {
                type: ["string", "null"],
                enum: ["best", "price", "duration", "departure", null],
              },
              refundableOnly: nullableBooleanSchema,
              airlines: nullableAirlinesSchema,
            },
            required: ["stops", "sort", "refundableOnly", "airlines"],
            additionalProperties: false,
          },
          hotels: {
            type: ["object", "null"],
            properties: {
              sort: {
                type: ["string", "null"],
                enum: ["best", "price", "rating", null],
              },
              minStars: nullableIntegerSchema,
              board: {
                type: ["string", "null"],
                enum: ["RO", "BB", "HB", null],
              },
            },
            required: ["sort", "minStars", "board"],
            additionalProperties: false,
          },
        },
        required: ["flights", "hotels"],
        additionalProperties: false,
      },
    },
    required: ["flights", "hotels", "budget", "tripType", "preferences"],
    additionalProperties: false,
  };
}

/** OpenAI strict mode uses null for omitted optional fields — normalize before Zod validation. */
export function normalizeOpenAIParsedParams(raw: unknown): TripSearchParams {
  const data = structuredClone(raw) as {
    flights?: { returnDate?: string | null; nonStop?: boolean | null };
    hotels?: { occupancies?: Array<{ childAges?: number[] | null }> };
    budget?: TripSearchParams["budget"] | null;
    preferences?: {
      flights?: Record<string, unknown> | null;
      hotels?: Record<string, unknown> | null;
    } | null;
  };

  if (data.flights?.returnDate === null) {
    delete data.flights.returnDate;
  }

  if (data.flights?.nonStop === null) {
    delete data.flights.nonStop;
  }

  if (data.budget === null) {
    delete (data as { budget?: TripSearchParams["budget"] }).budget;
  }

  for (const occupancy of data.hotels?.occupancies ?? []) {
    if (occupancy.childAges === null) {
      delete occupancy.childAges;
    }
  }

  if (data.preferences === null) {
    delete (data as { preferences?: TripSearchParams["preferences"] }).preferences;
  } else if (data.preferences) {
    const prefs = data.preferences;

    if (prefs.flights === null) {
      delete prefs.flights;
    } else if (prefs.flights) {
      for (const [key, value] of Object.entries(prefs.flights)) {
        if (value === null) {
          delete (prefs.flights as Record<string, unknown>)[key];
        }
      }
      if (Object.keys(prefs.flights).length === 0) {
        delete prefs.flights;
      }
    }

    if (prefs.hotels === null) {
      delete prefs.hotels;
    } else if (prefs.hotels) {
      for (const [key, value] of Object.entries(prefs.hotels)) {
        if (value === null) {
          delete (prefs.hotels as Record<string, unknown>)[key];
        }
      }
      if (Object.keys(prefs.hotels).length === 0) {
        delete prefs.hotels;
      }
    }

    if (!prefs.flights && !prefs.hotels) {
      delete (data as { preferences?: TripSearchParams["preferences"] }).preferences;
    }
  }

  const parsed = tripSearchParamsSchema.parse(data);

  if (parsed.preferences?.flights?.stops === "direct") {
    parsed.flights.nonStop = true;
  }

  return parsed;
}

export async function parseTripQueryWithOpenAI(
  query: string,
  apiKey: string,
  model: string,
  context?: TripSearchParams | null,
): Promise<TripSearchParams> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LLM_PARSE_TIMEOUT_MS);

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildOpenAIRequestBody(query, model, context)),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(
        `OpenAI API error: ${response.status}${detail ? ` — ${detail.slice(0, 200)}` : ""}`,
      );
    }

    const data = (await response.json()) as OpenAIChatResponse;
    const content = data.choices[0]?.message?.content;
    if (!content) throw new Error("Empty LLM response");

    return normalizeOpenAIParsedParams(JSON.parse(content));
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`OpenAI parse timed out after ${LLM_PARSE_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
