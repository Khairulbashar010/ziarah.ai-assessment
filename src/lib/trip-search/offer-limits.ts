/** Max offers sent to the client per domain (full results kept server-side). */
export function clientMaxFlightOffers(): number {
  return Number(process.env.CLIENT_MAX_FLIGHT_OFFERS ?? 50);
}

export function clientMaxHotelOffers(): number {
  return Number(process.env.CLIENT_MAX_HOTEL_OFFERS ?? 30);
}
