"use client";

import { X } from "lucide-react";
import type { HotelStaySegment, PublicHotelOffer } from "@/lib/types/trip";
import { staySegmentPrice } from "@/lib/client/hotel-stays";
import { formatDateRange } from "@/lib/utils/dates";
import { cn } from "@/lib/utils/cn";

type HotelStayBuilderProps = {
  stays: HotelStaySegment[];
  offers: PublicHotelOffer[];
  tripNights: number;
  remaining: number;
  onRemove: (segmentId: string) => void;
  onUpdateNights: (segmentId: string, nights: number) => void;
};

export function HotelStayBuilder({
  stays,
  offers,
  tripNights,
  remaining,
  onRemove,
  onUpdateNights,
}: HotelStayBuilderProps) {
  if (stays.length === 0) return null;

  return (
    <div className="mb-4 rounded-xl border border-purple-100 bg-purple-50/50 px-4 py-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-purple-800">
          Your stay plan
        </p>
        <p className="text-xs text-purple-700">
          {tripNights - remaining}/{tripNights} nights booked
          {remaining > 0 && (
            <span className="ml-1 font-medium text-amber-700">· {remaining} left</span>
          )}
        </p>
      </div>
      {remaining > 0 ? (
        <p className="mb-2 text-xs text-purple-700/80">
          Use <span className="font-medium">Pick</span> on a hotel card to add the next leg of your trip.
        </p>
      ) : (
        <p className="mb-2 text-xs text-amber-800">
          All nights are planned. Remove a stay above to add another hotel.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {stays.map((stay, index) => {
          const offer = offers.find((o) => o.id === stay.offerId);
          if (!offer) return null;
          const price = staySegmentPrice(offer, stay.nights);

          return (
            <div
              key={stay.id}
              className="flex items-center gap-2 rounded-lg border border-white bg-white px-2.5 py-2 shadow-sm"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-purple-100 text-[10px] font-bold text-purple-700">
                {index + 1}
              </span>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-gray-900">{offer.hotelName}</p>
                <p className="text-[10px] text-gray-500">
                  {formatDateRange(stay.checkIn, stay.checkOut)} · $
                  {price.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </p>
              </div>
              <label className="sr-only" htmlFor={`stay-nights-${stay.id}`}>
                Nights at {offer.hotelName}
              </label>
              <select
                id={`stay-nights-${stay.id}`}
                value={stay.nights}
                onChange={(e) => onUpdateNights(stay.id, Number(e.target.value))}
                className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-xs text-gray-700"
              >
                {Array.from({ length: tripNights }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}n
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => onRemove(stay.id)}
                className={cn(
                  "rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600",
                )}
                aria-label={`Remove ${offer.hotelName}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
