import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const METRO_ALIASES = [
  { searchCode: "LON", displayAirport: "LHR" },
  { searchCode: "NYC", displayAirport: "JFK" },
  { searchCode: "PAR", displayAirport: "CDG" },
  { searchCode: "TYO", displayAirport: "NRT" },
  { searchCode: "ROM", displayAirport: "FCO" },
];

const HOTEL_SUFFIXES = ["Airport Hotel", "City Inn", "Grand", "Suites", "Riverside"];
const CATEGORIES = ["3 STARS", "4 STARS", "5 STARS"];

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function hotelCodeFor(destinationCode, variant) {
  return 10000 + ((hashString(`${destinationCode}:${variant}`) >>> 0) % 89000);
}

function generateHotelsForAirport(destinationCode, airport) {
  const variantCount = 1 + (hashString(destinationCode) % 2);
  const hotels = [];

  for (let index = 0; index < variantCount; index += 1) {
    const suffix = HOTEL_SUFFIXES[(hashString(destinationCode) + index) % HOTEL_SUFFIXES.length];
    const category = CATEGORIES[(hashString(`${destinationCode}:cat`) + index) % CATEGORIES.length];
    const priceBase = 70 + (hashString(`${destinationCode}:price`) % 220);
    const starBoost = category.startsWith("5") ? 55 : category.startsWith("4") ? 25 : 0;

    hotels.push({
      code: hotelCodeFor(destinationCode, index),
      name: `${airport.city} ${suffix}`,
      destinationCode: destinationCode.toUpperCase(),
      category,
      lat: Math.round((airport.lat + index * 0.004) * 10000) / 10000,
      lng: Math.round((airport.lon + index * 0.003) * 10000) / 10000,
      pricePerNight: priceBase + starBoost,
    });
  }

  return hotels;
}

const airportsIndex = JSON.parse(
  readFileSync(join(root, "src/data/airports-index.json"), "utf8"),
);

const hotels = [];

for (const [code, airport] of Object.entries(airportsIndex)) {
  hotels.push(...generateHotelsForAirport(code, airport));
}

for (const alias of METRO_ALIASES) {
  const airport = airportsIndex[alias.displayAirport];
  if (!airport) continue;
  hotels.push(...generateHotelsForAirport(alias.searchCode, airport));
}

hotels.sort((a, b) => a.destinationCode.localeCompare(b.destinationCode) || a.code - b.code);

const curatedPath = join(root, "src/mocks/seed/curated-hotels.json");
const curated = JSON.parse(readFileSync(curatedPath, "utf8"));
const curatedCodes = new Set(curated.map((hotel) => hotel.destinationCode));
const generatedOnly = hotels.filter((hotel) => !curatedCodes.has(hotel.destinationCode));

const outputPath = join(root, "src/mocks/seed/hotels.json");
writeFileSync(outputPath, `${JSON.stringify(generatedOnly, null, 2)}\n`);

console.log(
  `Wrote ${generatedOnly.length} generated hotel seeds (${curated.length} curated destinations preserved separately)`,
);
