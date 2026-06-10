"use client";

import { MapPin, Plane } from "lucide-react";
import { getCityLabel } from "@/lib/geo/airports";
import { formatDateRange } from "@/lib/utils/dates";
import { cn } from "@/lib/utils/cn";

type RouteTimelineProps = {
  originCode: string;
  destinationCode: string;
  destinationName: string;
  checkIn: string;
  checkOut: string;
  roundTrip?: boolean;
  className?: string;
};

export function RouteTimeline({
  originCode,
  destinationCode,
  destinationName,
  checkIn,
  checkOut,
  roundTrip = true,
  className,
}: RouteTimelineProps) {
  const originCity = getCityLabel(originCode);
  const destCity = destinationName || getCityLabel(destinationCode);

  return (
    <div className={cn("flex w-full items-center gap-3", className)}>
      <div className="flex shrink-0 items-center gap-2 rounded-xl bg-white/80 px-3 py-2 shadow-sm ring-1 ring-purple-100">
        <MapPin className="h-4 w-4 text-purple-500" />
        <span className="text-sm font-semibold text-gray-800">{originCity}</span>
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-2">
        <div className="h-px flex-1 bg-gradient-to-r from-purple-200 to-purple-300" />
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-100">
          <Plane className="h-4 w-4 text-purple-600" />
        </div>
        <div className="h-px flex-1 bg-gradient-to-r from-purple-300 to-purple-200" />
      </div>

      <div className="shrink-0 rounded-2xl border border-purple-200/80 bg-white px-5 py-2.5 shadow-sm">
        <p className="text-sm font-bold text-gray-900">{destCity}</p>
        <p className="text-xs text-gray-500">{formatDateRange(checkIn, checkOut)}</p>
      </div>

      {roundTrip && (
        <>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="h-px flex-1 bg-gradient-to-r from-purple-200 to-purple-300" />
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-100">
              <Plane className="h-4 w-4 rotate-180 text-purple-600" />
            </div>
            <div className="h-px flex-1 bg-gradient-to-r from-purple-300 to-purple-200" />
          </div>

          <div className="flex shrink-0 items-center gap-2 rounded-xl bg-white/80 px-3 py-2 shadow-sm ring-1 ring-purple-100">
            <MapPin className="h-4 w-4 text-purple-500" />
            <span className="text-sm font-semibold text-gray-800">{originCity}</span>
          </div>
        </>
      )}
    </div>
  );
}
