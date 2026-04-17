"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = {
  primary: "bg-accent text-white hover:bg-accentSoft",
  secondary: "border border-line bg-panelSoft text-cream hover:border-accent/60 hover:text-white",
  ghost: "text-cream/80 hover:bg-white/5 hover:text-white",
  danger: "border border-red-500/40 bg-red-500/10 text-red-100 hover:bg-red-500/20"
} as const;

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof buttonVariants;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
        buttonVariants[variant],
        className
      )}
      {...props}
    />
  )
);

Button.displayName = "Button";
