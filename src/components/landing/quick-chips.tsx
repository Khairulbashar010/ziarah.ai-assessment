"use client";

import { Globe, Package, Sparkles, TrendingUp, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const chips: { label: string; icon: LucideIcon; query: string }[] = [
  { label: "Book Package", icon: Package, query: "family of 4 from Dubai to London, December 20-27, budget $3000" },
  { label: "Inspire Me", icon: Sparkles, query: "Plan a 5-day Japan trip with flights and hotels" },
  { label: "Surprise Me", icon: Globe, query: "Weekend getaway from Dubai under $1500" },
  { label: "Trending Now", icon: TrendingUp, query: "Romantic weekend in Paris from London, March 14-16" },
];

type QuickChipsProps = {
  onSelect: (query: string) => void;
  selected?: string;
};

export function QuickChips({ onSelect, selected }: QuickChipsProps) {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {chips.map((chip) => {
        const Icon = chip.icon;
        return (
          <button
            key={chip.label}
            type="button"
            onClick={() => onSelect(chip.query)}
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition-all",
              selected === chip.query
                ? "border-purple-400 bg-purple-500/20 text-white"
                : "border-white/10 bg-white/5 text-white/70 hover:border-purple-400/50 hover:bg-white/10",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}
