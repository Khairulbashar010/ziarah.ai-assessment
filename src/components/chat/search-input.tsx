"use client";

import { ArrowUp, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";

type SearchInputProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  loading?: boolean;
  placeholder?: string;
  variant?: "landing" | "chat";
};

export function SearchInput({
  value,
  onChange,
  onSubmit,
  loading,
  placeholder = "Plan your trip — ask me anything!",
  variant = "landing",
}: SearchInputProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <div
      className={cn(
        "glow-input flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 transition-all",
        variant === "landing" && "px-5 py-4",
      )}
    >
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={variant === "landing" ? 1 : 2}
        className="flex-1 resize-none bg-transparent text-white placeholder:text-white/40 focus:outline-none"
        disabled={loading}
      />
      <button
        type="button"
        onClick={onSubmit}
        disabled={loading || !value.trim()}
        className="rounded-full bg-accent p-2 text-white transition-opacity disabled:opacity-40"
      >
        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowUp className="h-5 w-5" />}
      </button>
    </div>
  );
}
