import type { PassengerCount } from "@/lib/types/trip";

export function totalPassengers(passengers: PassengerCount): number {
  return passengers.adults + passengers.children;
}
