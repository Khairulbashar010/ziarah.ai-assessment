"use client";

import Link from "next/link";
import { Sparkles, Plus } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const navItems = [
  { icon: Sparkles, href: "/", label: "Home" },
  { icon: Plus, href: "/", label: "New", highlight: true },
];

export function Sidebar({ active = "home" }: { active?: string }) {
  return (
    <aside
      className="flex w-14 shrink-0 flex-col items-center gap-3 border-r border-white/5 py-4"
      style={{ background: "var(--sidebar-bg)" }}
    >
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = item.label.toLowerCase() === active;

        return (
          <Link
            key={item.label}
            href={item.href}
            title={item.label}
            className={cn(
              "rounded-lg p-2 transition-colors",
              item.highlight
                ? "bg-accent text-white"
                : isActive
                  ? "bg-white/10 text-white"
                  : "text-white/50 hover:bg-white/5 hover:text-white/80",
            )}
          >
            <Icon className="h-5 w-5" />
          </Link>
        );
      })}
    </aside>
  );
}
