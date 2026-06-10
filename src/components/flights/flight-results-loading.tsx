"use client";

import { Skeleton } from "@/components/ui/skeleton";

export function FlightResultsLoading() {
  return (
    <div className="flex h-full flex-col bg-gray-50">
      <div className="border-b border-gray-200 bg-white px-5 py-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="mt-2 h-4 w-64" />
        <Skeleton className="mt-4 h-10 w-full rounded-xl" />
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="hidden w-64 shrink-0 border-r border-gray-200 bg-white p-4 md:block">
          <Skeleton className="mb-4 h-5 w-20" />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="mb-3 h-8 rounded-lg" />
          ))}
        </div>

        <div className="flex-1 space-y-3 p-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="overflow-hidden rounded-xl border border-gray-100 bg-white p-4"
            >
              <div className="flex items-center gap-4">
                <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/5" />
                  <Skeleton className="h-3 w-2/5" />
                </div>
                <Skeleton className="h-6 w-16" />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="shrink-0 border-t border-gray-200 bg-white px-5 py-4">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-32" />
          </div>
          <Skeleton className="h-11 w-36 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
