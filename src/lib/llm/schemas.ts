import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const iataCode = z
  .string()
  .regex(/^[A-Za-z]{3}$/)
  .transform((code) => code.toUpperCase());

const MAX_ADULTS = 9;
const MAX_CHILDREN = 8;
const MAX_INFANTS = 9;
const MAX_OCCUPANCIES = 5;
const MAX_ROOMS = 4;
const MAX_DESTINATION_LENGTH = 200;

const passengerCountSchema = z
  .object({
    adults: z.number().int().min(1).max(MAX_ADULTS),
    children: z.number().int().min(0).max(MAX_CHILDREN),
    infants: z.number().int().min(0).max(MAX_INFANTS),
  })
  .superRefine((passengers, ctx) => {
    if (passengers.infants > passengers.adults) {
      ctx.addIssue({
        code: "custom",
        message: "Infants cannot exceed adults",
        path: ["infants"],
      });
    }
  });

const occupancySchema = z.object({
  rooms: z.number().int().min(1).max(MAX_ROOMS),
  adults: z.number().int().min(1).max(MAX_ADULTS),
  children: z.number().int().min(0).max(MAX_CHILDREN),
  childAges: z.array(z.number().int().min(0).max(17)).max(MAX_CHILDREN).optional(),
});

const flightSearchPreferencesSchema = z
  .object({
    stops: z.enum(["any", "direct", "1", "2plus"]).optional(),
    sort: z.enum(["best", "price", "duration", "departure"]).optional(),
    refundableOnly: z.boolean().optional(),
    airlines: z
      .array(
        z
          .string()
          .regex(/^[A-Za-z]{2}$/)
          .transform((code) => code.toUpperCase()),
      )
      .optional(),
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
    passengers: passengerCountSchema,
    cabin: z.enum(["ECONOMY", "PREMIUM_ECONOMY", "BUSINESS", "FIRST"]),
    nonStop: z.boolean().optional(),
  }),
  hotels: z.object({
    destination: z.string().min(1).max(MAX_DESTINATION_LENGTH),
    destinationCode: iataCode,
    checkIn: isoDate,
    checkOut: isoDate,
    occupancies: z.array(occupancySchema).min(1).max(MAX_OCCUPANCIES),
  }),
  budget: z
    .object({
      maxTotal: z.number().positive(),
      currency: z
        .string()
        .regex(/^[A-Za-z]{3}$/)
        .transform((code) => code.toUpperCase()),
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
