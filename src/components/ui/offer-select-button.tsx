import { cn } from "@/lib/utils/cn";

type OfferSelectButtonProps = {
  selected?: boolean;
  onClick?: () => void;
};

export function OfferSelectButton({ selected, onClick }: OfferSelectButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg px-3 py-1.5 text-xs font-medium",
        selected
          ? "bg-purple-600 text-white"
          : "border border-purple-200 text-purple-700 hover:bg-purple-50",
      )}
    >
      {selected ? "Selected" : "Pick"}
    </button>
  );
}
