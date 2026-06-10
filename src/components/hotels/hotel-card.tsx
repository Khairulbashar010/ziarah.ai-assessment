"use client";

import { useEffect, useState, type KeyboardEvent } from "react";
import { Bed, Calendar, ChevronDown, ChevronUp, Coffee, Star } from "lucide-react";
import { OfferSelectButton } from "@/components/ui/offer-select-button";
import type { HotelStaySegment, PublicHotelOffer } from "@/lib/types/trip";
import { staySegmentPrice } from "@/lib/client/hotel-stays";
import { formatDateRange } from "@/lib/utils/dates";
import { cn } from "@/lib/utils/cn";

type HotelCardProps = {
  offer: PublicHotelOffer;
  selected?: boolean;
  staySegments?: HotelStaySegment[];
  onSelect?: () => void;
  withinBudget?: boolean;
  pickingNights?: boolean;
  maxNights?: number;
  defaultNights?: number;
  onConfirmNights?: (nights: number) => void;
  onCancelPick?: () => void;
};

function formatCancellationSummary(
  policies: PublicHotelOffer["cancellationPolicies"],
): string | null {
  const policy = policies[0];
  if (!policy) return null;

  const from = new Date(policy.from).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });

  return Number(policy.amount) > 0
    ? `From $${Number(policy.amount).toLocaleString()} fee after ${from}`
    : `Free cancellation until ${from}`;
}

function starCount(category: string): number {
  return Number.parseInt(category, 10) || 3;
}

export function HotelCard({
  offer,
  selected,
  staySegments = [],
  onSelect,
  withinBudget,
  pickingNights,
  maxNights = 1,
  defaultNights = 1,
  onConfirmNights,
  onCancelPick,
}: HotelCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [nightCount, setNightCount] = useState(defaultNights);

  useEffect(() => {
    if (pickingNights) setNightCount(defaultNights);
  }, [pickingNights, defaultNights]);

  const cancellation = formatCancellationSummary(offer.cancellationPolicies);
  const stars = starCount(offer.category);
  const perNight = offer.nights > 0 ? offer.totalPrice / offer.nights : offer.totalPrice;
  const canPick = maxNights > 0;

  const totalBookedNights = staySegments.reduce((sum, segment) => sum + segment.nights, 0);
  const showStayBadges =
    staySegments.length > 0 &&
    (staySegments.length > 1 || totalBookedNights < offer.nights);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border bg-white transition-all",
        selected ? "border-purple-300 ring-1 ring-purple-100" : "border-gray-100 hover:border-purple-100",
        pickingNights && "border-purple-400 ring-2 ring-purple-100",
        expanded && "border-purple-100 shadow-sm",
      )}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded((v) => !v);
          }
        }}
        className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-gray-50/60"
      >
        <div className="flex shrink-0 flex-col items-center gap-0.5">
          <div className="flex items-center gap-px">
            {Array.from({ length: stars }).map((_, i) => (
              <Star key={i} className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
            ))}
          </div>
          <span className="text-[10px] font-medium text-gray-400">{offer.nights}n</span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <h3 className="truncate text-sm font-semibold text-gray-900">{offer.hotelName}</h3>
            <span className="text-xs text-gray-300">·</span>
            <span className="truncate text-xs text-gray-500">{offer.roomName}</span>
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
            {selected && totalBookedNights > 0 && !showStayBadges && (
              <span className="rounded bg-purple-50 px-1.5 py-0.5 text-[10px] font-medium text-purple-700">
                All {offer.nights} nights
              </span>
            )}
            {showStayBadges &&
              staySegments.map((segment) => (
                <span
                  key={segment.id}
                  className="rounded bg-purple-50 px-1.5 py-0.5 text-[10px] font-medium text-purple-700"
                >
                  {segment.nights}n · {formatDateRange(segment.checkIn, segment.checkOut)}
                </span>
              ))}
          </div>
          <p className="mt-0.5 truncate text-xs text-gray-400">
            {offer.boardName} · {formatDateRange(offer.checkIn, offer.checkOut)}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div className="text-right">
            <p className="text-base font-bold text-gray-900">
              ${offer.totalPrice.toLocaleString(undefined, { minimumFractionDigits: 0 })}
            </p>
            <p className="text-[10px] text-gray-400">
              ${perNight.toLocaleString(undefined, { maximumFractionDigits: 0 })}/night
            </p>
          </div>
          <span className="text-gray-400" aria-hidden>
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </span>
          <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            <OfferSelectButton selected={selected} onClick={onSelect} />
          </div>
        </div>
      </div>

      {pickingNights && (
        <div className="border-t border-purple-100 bg-purple-50/80 px-4 py-3">
          {canPick ? (
            <>
              <p className="text-xs font-medium text-purple-900">
                How many nights at {offer.hotelName}?
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <select
                  value={nightCount}
                  onChange={(e) => setNightCount(Number(e.target.value))}
                  className="rounded-lg border border-purple-200 bg-white px-2 py-1.5 text-sm text-gray-800"
                >
                  {Array.from({ length: maxNights }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n} night{n !== 1 ? "s" : ""} · $
                      {staySegmentPrice(offer, n).toLocaleString(undefined, {
                        maximumFractionDigits: 0,
                      })}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => onConfirmNights?.(nightCount)}
                  className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-700"
                >
                  Add {nightCount} night{nightCount !== 1 ? "s" : ""}
                </button>
                <button
                  type="button"
                  onClick={onCancelPick}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={onCancelPick}
              className="text-xs font-medium text-purple-700 hover:text-purple-900"
            >
              Close
            </button>
          )}
        </div>
      )}

      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50/80 px-4 py-3">
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-xs text-gray-700 ring-1 ring-gray-100">
              <Bed className="h-3 w-3 text-purple-500" />
              {offer.roomName}
            </span>
            <span className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-xs text-gray-700 ring-1 ring-gray-100">
              <Coffee className="h-3 w-3 text-blue-500" />
              {offer.boardName}
            </span>
            <span className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-xs text-gray-700 ring-1 ring-gray-100">
              <Calendar className="h-3 w-3 text-gray-500" />
              {formatDateRange(offer.checkIn, offer.checkOut)} ({offer.nights} nights)
            </span>
          </div>
          {cancellation && <p className="mt-2 text-xs text-gray-600">{cancellation}</p>}
          {offer.rateType === "RECHECK" && (
            <p className="mt-1 text-xs text-amber-600">Rate to be confirmed at booking</p>
          )}
          <p className="mt-2 text-[10px] uppercase tracking-wider text-gray-400">
            {offer.category} · {offer.provider}
          </p>
        </div>
      )}
    </div>
  );
}
