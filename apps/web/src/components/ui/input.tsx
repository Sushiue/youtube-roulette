import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "w-full rounded-2xl border border-line bg-black/30 px-4 py-3 text-sm text-cream outline-none transition placeholder:text-cream/40 focus:border-accent/70",
        className
      )}
      {...props}
    />
  )
);

Input.displayName = "Input";
