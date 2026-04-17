import { cn } from "@/lib/utils";

export function StatusPill({
  label,
  tone = "default"
}: {
  label: string;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]",
        tone === "success" && "bg-emerald-500/12 text-emerald-200 ring-1 ring-emerald-500/30",
        tone === "warning" && "bg-amber-500/12 text-amber-100 ring-1 ring-amber-500/30",
        tone === "danger" && "bg-red-500/12 text-red-100 ring-1 ring-red-500/30",
        tone === "default" && "bg-white/8 text-cream/80 ring-1 ring-white/10"
      )}
    >
      {label}
    </span>
  );
}
