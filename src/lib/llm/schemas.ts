import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const iataCode = z.string().length(3);

const flightSearchPreferencesSchema = z
  .object({
    stops: z.enum(["any", "direct", "1", "2plus"]).optional(),
    sort: z.enum(["best", "price", "duration", "departure"]).optional(),
    refundableOnly: z.boolean().optional(),
    airlines: z.array(z.string().length(2)).optional(),
  })
  .optional();

const hotelSearchPreferencesSchema = z
  .object({
    sort: z.enum(["best", "price", "rating"]).optional(),
    minStars: z.number().int().min(1).max(5).optional(),
    board: z.enum(["RO", "BB", "HB"]).optional(),
  })
  .optional();

export const tripSearchParamsSchema = z.object({
  flights: z.object({
    origin: iataCode,
    destination: iataCode,
    departureDate: isoDate,
    returnDate: isoDate.optional(),
    passengers: z.object({
      adults: z.number().int().min(1),
      children: z.number().int().min(0),
      infants: z.number().int().min(0),
    }),
    cabin: z.enum(["ECONOMY", "PREMIUM_ECONOMY", "BUSINESS", "FIRST"]),
    nonStop: z.boolean().optional(),
  }),
  hotels: z.object({
    destination: z.string(),
    destinationCode: iataCode,
    checkIn: isoDate,
    checkOut: isoDate,
    occupancies: z.array(
      z.object({
        rooms: z.number().int().min(1),
        adults: z.number().int().min(1),
        children: z.number().int().min(0),
        childAges: z.array(z.number().int()).optional(),
      }),
    ),
  }),
  budget: z
    .object({
      maxTotal: z.number().positive(),
      currency: z.string().length(3),
    })
    .optional(),
  tripType: z.enum(["ONE_WAY", "ROUND_TRIP"]),
  preferences: z
    .object({
      flights: flightSearchPreferencesSchema,
      hotels: hotelSearchPreferencesSchema,
    })
    .optional(),
});

/** OpenAI structured-output schema (strip $schema before sending to the API). */
export const tripSearchParamsJsonSchema = z.toJSONSchema(tripSearchParamsSchema);
