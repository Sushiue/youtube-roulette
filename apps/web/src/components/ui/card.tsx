import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Card({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[28px] border border-white/10 bg-panel/90 p-6 shadow-[0_20px_80px_rgba(0,0,0,0.35)] backdrop-blur-sm",
        className
      )}
    >
      {children}
    </div>
  );
}
