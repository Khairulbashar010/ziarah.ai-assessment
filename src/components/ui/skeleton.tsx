import { cn } from "@/lib/utils/cn";

type SkeletonProps = {
  className?: string;
};

export function Skeleton({ className }: SkeletonProps) {
  return <div className={cn("skeleton-shimmer rounded-md", className)} />;
}
