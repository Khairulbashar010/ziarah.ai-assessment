"use client";

import { useCallback, useState } from "react";
import { navigateToTripSearch } from "@/lib/client/navigate-to-trip";
import { Sidebar } from "@/components/layout/sidebar";
import { Hero } from "@/components/landing/hero";
import { QuickChips } from "@/components/landing/quick-chips";
import { SearchInput } from "@/components/chat/search-input";

export default function HomePage() {
  const [query, setQuery] = useState("");

  const navigateToTrip = useCallback(
    (nextQuery?: string) => {
      const trimmed = (nextQuery ?? query).trim();
      if (!trimmed) return;
      navigateToTripSearch(trimmed);
    },
    [query],
  );

  return (
    <div className="gradient-bg flex min-h-screen">
      <Sidebar active="home" />
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-3xl space-y-8">
          <Hero />
          <QuickChips selected={query} onSelect={setQuery} />
          <SearchInput
            value={query}
            onChange={setQuery}
            onSubmit={() => navigateToTrip()}
            placeholder="Plan a 5-day Japan trip with flights and hotels"
            variant="landing"
          />
        </div>
      </main>
    </div>
  );
}
