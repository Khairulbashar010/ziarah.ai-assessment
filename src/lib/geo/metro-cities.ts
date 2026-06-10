export type MetroCity = {
  name: string;
  searchCode: string;
  displayAirport: string;
};

/** Known cities: search API codes and primary airport for maps */
export const METRO_CITIES: Record<string, MetroCity> = {
  dubai: { name: "Dubai", searchCode: "DXB", displayAirport: "DXB" },
  london: { name: "London", searchCode: "LON", displayAirport: "LHR" },
  paris: { name: "Paris", searchCode: "PAR", displayAirport: "CDG" },
  tokyo: { name: "Tokyo", searchCode: "TYO", displayAirport: "NRT" },
  bangkok: { name: "Bangkok", searchCode: "BKK", displayAirport: "BKK" },
  "new york": { name: "New York", searchCode: "NYC", displayAirport: "JFK" },
  rome: { name: "Rome", searchCode: "ROM", displayAirport: "FCO" },
  barcelona: { name: "Barcelona", searchCode: "BCN", displayAirport: "BCN" },
  amsterdam: { name: "Amsterdam", searchCode: "AMS", displayAirport: "AMS" },
  singapore: { name: "Singapore", searchCode: "SIN", displayAirport: "SIN" },
  fail: { name: "Fail", searchCode: "ZZZ", displayAirport: "ZZZ" },
};

const DISPLAY_BY_SEARCH_CODE = Object.fromEntries(
  Object.values(METRO_CITIES).map((c) => [c.searchCode, c.displayAirport]),
);

export function resolveMetroCity(cityName: string): MetroCity | null {
  return METRO_CITIES[cityName.trim().toLowerCase()] ?? null;
}

export function resolveDisplayAirport(code: string): string {
  return DISPLAY_BY_SEARCH_CODE[code.toUpperCase()] ?? code.toUpperCase();
}
