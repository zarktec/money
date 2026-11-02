import { cn } from "@/lib/utils";

export function Progress({ percent, level = "ok", label }: { percent: number; level?: "ok" | "warn" | "over"; label?: string }) {
  const w = Math.max(0, Math.min(100, percent));
  return (
    <div role="progressbar" aria-valuenow={Math.min(percent, 100)} aria-valuemin={0} aria-valuemax={100} aria-label={label} className="h-2.5 w-full overflow-hidden rounded-full bg-line">
      <div className={cn("h-full rounded-full transition-all", level === "over" ? "bg-danger" : level === "warn" ? "bg-warn" : "bg-brand")} style={{ width: `${w}%` }} />
    </div>
  );
}
