export type RouteOffer = {
  carrier: string;
  flightNumber: string;
  origin: string;
  destination: string;
  departure: string;
  arrival: string;
  stops: number;
  priceMultiplier: number;
};

export type RouteSeed = {
  origin: string;
  destination: string;
  priceMin: number;
  priceMax: number;
  durationMinutes: number;
  offers: RouteOffer[];
};

export type HotelSeed = {
  code: number;
  name: string;
  destinationCode: string;
  category: string;
  lat: number;
  lng: number;
  pricePerNight: number;
};
