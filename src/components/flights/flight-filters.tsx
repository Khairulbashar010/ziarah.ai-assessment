"use client";

import { SlidersHorizontal } from "lucide-react";
import type { FlightFilterState, FlightSortOption, FlightStopsFilter } from "@/lib/client/flight-filters";
import { cn } from "@/lib/utils/cn";

type FlightFiltersProps = {
  filters: FlightFilterState;
  defaults: FlightFilterState;
  airlines: string[];
  priceRange: { min: number; max: number };
  budgetMax?: number;
  budgetLabel?: string;
  budgetHint?: string;
  onChange: (filters: FlightFilterState) => void;
  onReset: () => void;
};

const SORT_OPTIONS: { value: FlightSortOption; label: string }[] = [
  { value: "best", label: "Best match" },
  { value: "price", label: "Lowest price" },
  { value: "duration", label: "Shortest" },
  { value: "departure", label: "Earliest departure" },
];

const STOPS_OPTIONS: { value: FlightStopsFilter; label: string }[] = [
  { value: "any", label: "Any" },
  { value: "direct", label: "Direct only" },
  { value: "1", label: "1 stop" },
  { value: "2plus", label: "2+ stops" },
];

export function FlightFilters({
  filters,
  defaults,
  airlines,
  priceRange,
  budgetMax,
  budgetLabel,
  budgetHint,
  onChange,
  onReset,
}: FlightFiltersProps) {
  const sliderMax = Math.max(priceRange.max, budgetMax ?? 0, filters.maxPrice ?? 0, 100);

  function toggleAirline(carrier: string) {
    const next = filters.airlines.includes(carrier)
      ? filters.airlines.filter((a) => a !== carrier)
      : [...filters.airlines, carrier];
    onChange({ ...filters, airlines: next });
  }

  return (
    <aside className="w-72 shrink-0 overflow-y-auto border-r border-gray-200 bg-white px-5 py-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <SlidersHorizontal className="h-4 w-4 text-purple-600" />
          Filters
        </div>
        <button
          type="button"
          onClick={onReset}
          className="text-xs font-medium text-purple-600 hover:text-purple-800"
        >
          Reset
        </button>
      </div>

      <div className="space-y-5">
        <section>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Sort by</p>
          <div className="space-y-1">
            {SORT_OPTIONS.map((option) => (
              <label
                key={option.value}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm",
                  filters.sort === option.value ? "bg-purple-50 text-purple-800" : "text-gray-700",
                )}
              >
                <input
                  type="radio"
                  name="sort"
                  checked={filters.sort === option.value}
                  onChange={() => onChange({ ...filters, sort: option.value })}
                  className="accent-purple-600"
                />
                {option.label}
              </label>
            ))}
          </div>
        </section>

        {budgetMax !== undefined && (
          <section>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={filters.withinBudgetOnly}
                onChange={(e) => onChange({ ...filters, withinBudgetOnly: e.target.checked })}
                className="rounded accent-purple-600"
              />
              {budgetLabel ?? `Within $${budgetMax.toLocaleString()} budget`}
            </label>
            {budgetHint && <p className="mt-1 text-xs text-gray-500">{budgetHint}</p>}
          </section>
        )}

        <section>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Stops</p>
          <div className="space-y-1">
            {STOPS_OPTIONS.map((option) => (
              <label
                key={option.value}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm",
                  filters.stops === option.value ? "bg-purple-50 text-purple-800" : "text-gray-700",
                )}
              >
                <input
                  type="radio"
                  name="stops"
                  checked={filters.stops === option.value}
                  onChange={() => onChange({ ...filters, stops: option.value })}
                  className="accent-purple-600"
                />
                {option.label}
              </label>
            ))}
          </div>
        </section>

        <section>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Max price
          </p>
          <input
            type="range"
            min={priceRange.min}
            max={sliderMax}
            step={50}
            value={filters.maxPrice ?? sliderMax}
            onChange={(e) => onChange({ ...filters, maxPrice: Number(e.target.value) })}
            className="w-full accent-purple-600"
          />
          <p className="mt-1 text-sm text-gray-600">
            Up to ${(filters.maxPrice ?? sliderMax).toLocaleString()}
          </p>
        </section>

        <section>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={filters.refundableOnly}
              onChange={(e) => onChange({ ...filters, refundableOnly: e.target.checked })}
              className="rounded accent-purple-600"
            />
            Refundable only
          </label>
        </section>

        {airlines.length > 0 && (
          <section>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Airlines
            </p>
            <div className="max-h-40 space-y-1 overflow-y-auto">
              {airlines.map((carrier) => (
                <label
                  key={carrier}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-sm text-gray-700"
                >
                  <input
                    type="checkbox"
                    checked={filters.airlines.includes(carrier)}
                    onChange={() => toggleAirline(carrier)}
                    className="rounded accent-purple-600"
                  />
                  {carrier}
                </label>
              ))}
            </div>
          </section>
        )}
      </div>
    </aside>
  );
}
