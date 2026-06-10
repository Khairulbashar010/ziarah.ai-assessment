"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Plane } from "lucide-react";
import { OfferSelectButton } from "@/components/ui/offer-select-button";
import type { FlightSegment, PublicFlightOffer } from "@/lib/types/trip";
import {
  formatDateShort,
  formatDuration,
  formatTime,
} from "@/lib/utils/dates";
import { cn } from "@/lib/utils/cn";

type FlightCardProps = {
  offer: PublicFlightOffer;
  selected?: boolean;
  onSelect?: () => void;
  withinBudget?: boolean;
};

function splitLegs(segments: FlightSegment[]): FlightSegment[][] {
  if (segments.length <= 1) return [segments];

  const midpoint = Math.ceil(segments.length / 2);
  return [segments.slice(0, midpoint), segments.slice(midpoint)].filter((leg) => leg.length > 0);
}

function legStopLabel(segments: FlightSegment[]): string {
  const stops = Math.max(0, segments.length - 1);
  return stops === 0 ? "Direct" : `${stops} stop${stops > 1 ? "s" : ""}`;
}

function RouteSummary({ segments }: { segments: FlightSegment[] }) {
  const first = segments[0];
  const last = segments[segments.length - 1];
  if (!first || !last) return null;

  return (
    <span className="truncate text-sm text-gray-700">
      <span className="font-semibold text-gray-900">{first.origin}</span>{" "}
      {formatTime(first.departure)}
      <span className="mx-1.5 text-gray-300">→</span>
      <span className="font-semibold text-gray-900">{last.destination}</span>{" "}
      {formatTime(last.arrival)}
    </span>
  );
}

function LegDetail({ label, segments }: { label: string; segments: FlightSegment[] }) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
      {segments.map((seg, i) => (
        <div
          key={`${seg.flightNumber}-${i}`}
          className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-700"
        >
          <span className="font-medium text-purple-700">
            {seg.carrier} {seg.flightNumber}
          </span>
          <span>
            {seg.origin} {formatTime(seg.departure)}
          </span>
          <Plane className="h-3 w-3 text-gray-300" />
          <span>
            {seg.destination} {formatTime(seg.arrival)}
          </span>
          <span className="text-xs text-gray-400">{formatDateShort(seg.departure)}</span>
        </div>
      ))}
      <p className="text-xs text-gray-400">{legStopLabel(segments)}</p>
    </div>
  );
}

export function FlightCard({ offer, selected, onSelect, withinBudget }: FlightCardProps) {
  const [expanded, setExpanded] = useState(false);
  const legs = splitLegs(offer.segments);
  const outbound = legs[0] ?? offer.segments;
  const returnLeg = legs[1];
  const stopLabel =
    offer.stops === 0 ? "Direct" : `${offer.stops} stop${offer.stops > 1 ? "s" : ""}`;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border bg-white transition-all",
        selected ? "border-purple-300 ring-1 ring-purple-100" : "border-gray-100 hover:border-purple-100",
        expanded && "border-purple-100 shadow-sm",
      )}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded((v) => !v);
          }
        }}
        className="flex cursor-pointer items-center gap-4 px-4 py-3.5 hover:bg-gray-50/60"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-purple-600 to-indigo-700 text-xs font-bold text-white">
          {offer.validatingCarrier}
        </span>

        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <RouteSummary segments={outbound} />
            <span className="text-xs text-gray-300">·</span>
            <span className="text-xs text-gray-500">{formatDuration(offer.durationMinutes)}</span>
            <span className="text-xs text-gray-300">·</span>
            <span className="text-xs text-gray-500">{stopLabel}</span>
            {offer.refundable && (
              <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                Refundable
              </span>
            )}
            {withinBudget === true && (
              <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                In budget
              </span>
            )}
            {withinBudget === false && (
              <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                Over budget
              </span>
            )}
          </div>
          {returnLeg && (
            <div className="flex items-center gap-2.5">
              <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Return</span>
              <RouteSummary segments={returnLeg} />
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <div className="text-right">
            <p className="text-base font-bold text-gray-900">
              ${offer.totalPrice.toLocaleString(undefined, { minimumFractionDigits: 0 })}
            </p>
            {offer.perPassenger > 0 && (
              <p className="text-[10px] text-gray-400">
                ${offer.perPassenger.toLocaleString(undefined, { minimumFractionDigits: 0 })}/pax
              </p>
            )}
          </div>
          <span className="text-gray-400" aria-hidden>
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </span>
          <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            <OfferSelectButton selected={selected} onClick={onSelect} />
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50/80 px-5 py-4">
          <div className={cn("grid gap-4", returnLeg ? "sm:grid-cols-2" : "grid-cols-1")}>
            <LegDetail label="Outbound" segments={outbound} />
            {returnLeg && <LegDetail label="Return" segments={returnLeg} />}
          </div>
          <p className="mt-3 text-[10px] uppercase tracking-wider text-gray-400">
            {offer.provider} · {offer.validatingCarrier}
          </p>
        </div>
      )}
    </div>
  );
}
