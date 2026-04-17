import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTimeLeft(ms: number) {
  const safe = Math.max(0, ms);
  const totalSeconds = Math.ceil(safe / 1000);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60);

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function truncate(value: string, max = 60) {
  if (value.length <= max) {
    return value;
  }

  return `${value.slice(0, max - 3)}...`;
}
