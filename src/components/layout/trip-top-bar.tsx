"use client";

import Link from "next/link";
import { Plus } from "lucide-react";

type TripTopBarProps = {
  dates?: string;
  travellers?: string;
};

export function TripTopBar({ dates, travellers }: TripTopBarProps) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-gray-100 bg-white px-5">
      <div className="flex items-center gap-4">
        <Link href="/" className="text-lg font-semibold tracking-tight text-gray-900">
          Ziarah<span className="text-accent">.</span>
        </Link>
        {dates && (
          <span className="hidden rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600 sm:inline">
            {dates}
          </span>
        )}
        {travellers && (
          <span className="hidden rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600 sm:inline">
            {travellers}
          </span>
        )}
      </div>

      <Link
        href="/"
        className="flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
      >
        <Plus className="h-3.5 w-3.5" />
        New Trip
      </Link>
    </header>
  );
}
