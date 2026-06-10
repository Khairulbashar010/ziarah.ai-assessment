import type {
  PublicFlightOffer,
  PublicHotelOffer,
  TripSearchParams,
  TripSearchResponse,
} from "@/lib/types/trip";

export const mockParsedQuery: TripSearchParams = {
  flights: {
    origin: "DXB",
    destination: "LON",
    departureDate: "2025-12-20",
    returnDate: "2025-12-27",
    passengers: { adults: 2, children: 1, infants: 0 },
    cabin: "ECONOMY",
  },
  hotels: {
    destination: "London",
    destinationCode: "LON",
    checkIn: "2025-12-20",
    checkOut: "2025-12-27",
    occupancies: [{ rooms: 1, adults: 2, children: 1 }],
  },
  budget: { maxTotal: 5000, currency: "USD" },
  tripType: "ROUND_TRIP",
  preferences: {
    flights: { stops: "any", sort: "best" },
    hotels: { sort: "price", minStars: 4 },
  },
};

export function mockFlightOffer(
  overrides: Partial<PublicFlightOffer> = {},
): PublicFlightOffer {
  return {
    id: "flight-1",
    provider: "sabre",
    totalPrice: 1200,
    currency: "USD",
    perPassenger: 400,
    validatingCarrier: "EK",
    stops: 0,
    durationMinutes: 480,
    segments: [
      {
        origin: "DXB",
        destination: "LHR",
        departure: "2025-12-20T08:00:00Z",
        arrival: "2025-12-20T14:00:00Z",
        carrier: "EK",
        flightNumber: "1",
      },
    ],
    refundable: true,
    ...overrides,
  };
}

export function mockRoundTripFlightOffer(): PublicFlightOffer {
  return mockFlightOffer({
    id: "flight-rt",
    stops: 1,
    refundable: false,
    perPassenger: 0,
    segments: [
      {
        origin: "DXB",
        destination: "IST",
        departure: "2025-12-20T08:00:00Z",
        arrival: "2025-12-20T12:00:00Z",
        carrier: "TK",
        flightNumber: "100",
      },
      {
        origin: "IST",
        destination: "LHR",
        departure: "2025-12-20T14:00:00Z",
        arrival: "2025-12-20T18:00:00Z",
        carrier: "TK",
        flightNumber: "101",
      },
      {
        origin: "LHR",
        destination: "IST",
        departure: "2025-12-27T10:00:00Z",
        arrival: "2025-12-27T16:00:00Z",
        carrier: "TK",
        flightNumber: "200",
      },
      {
        origin: "IST",
        destination: "DXB",
        departure: "2025-12-27T18:00:00Z",
        arrival: "2025-12-28T00:00:00Z",
        carrier: "TK",
        flightNumber: "201",
      },
    ],
  });
}

export function mockHotelOffer(
  overrides: Partial<PublicHotelOffer> = {},
): PublicHotelOffer {
  return {
    id: "hotel-1",
    provider: "hotelbeds",
    hotelCode: 101,
    hotelName: "Grand London Hotel",
    destinationCode: "LON",
    category: "4",
    checkIn: "2025-12-20",
    checkOut: "2025-12-27",
    nights: 7,
    roomName: "Deluxe Double",
    boardName: "Bed & Breakfast",
    totalPrice: 1400,
    currency: "USD",
    rateType: "BOOKABLE",
    cancellationPolicies: [{ amount: "0", from: "2025-12-15T00:00:00Z" }],
    ...overrides,
  };
}

/** Trip response without minStars hotel filter so all mock hotels appear in panel tests. */
export function mockTripSearchResponseAllHotels(
  overrides: Partial<TripSearchResponse> = {},
): TripSearchResponse {
  return mockTripSearchResponse({
    parsedQuery: {
      ...mockParsedQuery,
      preferences: {
        flights: mockParsedQuery.preferences?.flights,
        hotels: { sort: "price" },
      },
    },
    ...overrides,
  });
}

export function mockTripSearchResponse(
  overrides: Partial<TripSearchResponse> = {},
): TripSearchResponse {
  const flights = overrides.flights?.offers ?? [
    mockFlightOffer(),
    mockFlightOffer({
      id: "flight-2",
      totalPrice: 2800,
      stops: 1,
      validatingCarrier: "BA",
      refundable: false,
      segments: [
        {
          origin: "DXB",
          destination: "LHR",
          departure: "2025-12-20T10:00:00Z",
          arrival: "2025-12-20T16:00:00Z",
          carrier: "BA",
          flightNumber: "107",
        },
      ],
    }),
  ];
  const hotels = overrides.hotels?.offers ?? [
    mockHotelOffer(),
    mockHotelOffer({
      id: "hotel-2",
      hotelName: "Budget Stay Inn",
      category: "3",
      totalPrice: 900,
    }),
  ];

  return {
    requestId: "req-test",
    parsedQuery: overrides.parsedQuery ?? mockParsedQuery,
    meta: {
      durationMs: 1200,
      providersQueried: 3,
      providersSucceeded: 3,
      providersFailed: 0,
      partialResults: false,
      cache: {
        status: "fresh",
        cachedAt: "2025-01-01T00:00:00.000Z",
        expiresAt: "2025-01-01T00:05:00.000Z",
        refreshInMs: 180_000,
        ttlMs: 300_000,
      },
      ...overrides.meta,
    },
    providers: overrides.providers ?? {
      sabre: { domain: "flights", status: "success", offerCount: 2, durationMs: 100 },
      amadeus: { domain: "flights", status: "success", offerCount: 2, durationMs: 120 },
      hotelbeds: { domain: "hotels", status: "success", offerCount: 2, durationMs: 90 },
    },
    flights: {
      totalOffers: flights.length,
      truncated: false,
      withinBudget: true,
      offers: flights,
      ...overrides.flights,
    },
    hotels: {
      totalOffers: hotels.length,
      truncated: false,
      offers: hotels,
      ...overrides.hotels,
    },
    tripSummary: {
      cheapestFlight: 1200,
      cheapestHotel: 900,
      estimatedTripTotal: 2100,
      currency: "USD",
      withinBudget: true,
      budgetRemaining: 2900,
      suggestedMinBudget: null,
      ...overrides.tripSummary,
    },
  };
}
