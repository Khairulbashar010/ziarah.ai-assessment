"use client";

import { useState } from "react";
import { Bed, ChevronDown, ChevronUp, Plane, Plus } from "lucide-react";
import { roundMoney } from "@/lib/utils/money";
import { cn } from "@/lib/utils/cn";

type BreakdownItem = {
  label: string;
  price: number;
};

type TripFooterProps = {
  total: number | null;
  currency?: string;
  withinBudget?: boolean | null;
  budget?: number;
  flightPrice?: number;
  hotelPrice?: number;
  flightLabel?: string;
  hotelLabel?: string;
  hotelBreakdown?: BreakdownItem[];
  onBook?: () => void;
};

function formatPrice(amount: number): string {
  return roundMoney(amount).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function BreakdownChip({
  icon: Icon,
  label,
  price,
}: {
  icon: typeof Plane;
  label: string;
  price: number;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2.5 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white shadow-sm">
        <Icon className="h-3.5 w-3.5 text-purple-600" />
      </div>
      <div className="min-w-0">
        <p className="max-w-[140px] truncate text-xs text-gray-500">{label}</p>
        <p className="whitespace-nowrap text-sm font-semibold text-gray-900">${formatPrice(price)}</p>
      </div>
    </div>
  );
}

export function TripFooter({
  total,
  currency = "USD",
  withinBudget,
  budget,
  flightPrice,
  hotelPrice,
  flightLabel,
  hotelLabel,
  hotelBreakdown,
  onBook,
}: TripFooterProps) {
  const [expanded, setExpanded] = useState(false);

  const budgetUsed =
    budget !== undefined && total !== null ? Math.min(100, (total / budget) * 100) : null;

  const hotelItems =
    hotelBreakdown && hotelBreakdown.length > 0
      ? hotelBreakdown
      : hotelPrice !== undefined && hotelLabel
        ? [{ label: hotelLabel, price: hotelPrice }]
        : [];

  const remaining =
    budget !== undefined && total !== null ? roundMoney(budget - total) : null;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-lg">
      {expanded && budgetUsed !== null && (
        <div className="h-1 bg-gray-100">
          <div
            className={cn(
              "h-full transition-all duration-500",
              withinBudget ? "bg-emerald-500" : "bg-red-400",
            )}
            style={{ width: `${budgetUsed}%` }}
          />
        </div>
      )}

      <button
        type="button"
        onClick={() => setExpanded((open) => !open)}
        aria-label={expanded ? "Collapse trip total" : "Expand trip total"}
        aria-expanded={expanded}
        className="absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
      >
        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {expanded ? (
        <div className="flex flex-col gap-4 px-5 pb-4 pt-3 pr-12 sm:flex-row sm:items-center sm:gap-6">
          <div className="shrink-0">
            <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400">Trip total</p>
            <div className="mt-0.5 flex items-baseline gap-1.5 whitespace-nowrap">
              <span className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
                {total !== null ? `$${formatPrice(total)}` : "—"}
              </span>
              <span className="text-sm text-gray-400">{currency}</span>
            </div>
            {budget !== undefined && withinBudget !== null && remaining !== null && (
              <p
                className={cn(
                  "mt-1 whitespace-nowrap text-sm",
                  withinBudget ? "text-emerald-600" : "text-red-500",
                )}
              >
                {withinBudget ? (
                  <>
                    <span className="font-medium">${formatPrice(remaining)}</span>
                    <span className="text-emerald-500/80"> under ${formatPrice(budget)} budget</span>
                  </>
                ) : (
                  <>
                    Over budget by{" "}
                    <span className="font-medium">${formatPrice(Math.abs(remaining))}</span>
                  </>
                )}
              </p>
            )}
          </div>

          {flightPrice !== undefined && hotelItems.length > 0 && (
            <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
              <BreakdownChip icon={Plane} label={flightLabel ?? "Flight"} price={flightPrice} />
              <Plus className="h-3.5 w-3.5 shrink-0 text-gray-300" />
              {hotelItems.map((item, index) => (
                <BreakdownChip
                  key={`${item.label}-${index}`}
                  icon={Bed}
                  label={item.label}
                  price={item.price}
                />
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={onBook}
            disabled={withinBudget === false || total === null}
            className="shrink-0 self-start rounded-xl bg-accent px-6 py-3 text-sm font-semibold text-white shadow-md shadow-purple-200 transition-all hover:opacity-90 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none sm:self-center sm:px-8 sm:py-3.5"
          >
            Book Now
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex w-full items-center px-5 py-3 pr-12 text-left transition-colors hover:bg-gray-50/60"
        >
          <div className="flex items-baseline gap-1.5 whitespace-nowrap">
            <span className="text-xl font-bold tracking-tight text-gray-900">
              {total !== null ? `$${formatPrice(total)}` : "—"}
            </span>
            <span className="text-sm text-gray-400">{currency}</span>
          </div>
        </button>
      )}
    </div>
  );
}
