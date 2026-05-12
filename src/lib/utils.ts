import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: string | null | undefined): string {
  if (!amount) return "—";
  const num = parseFloat(amount);
  if (isNaN(num)) return amount;
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(num);
}

export function formatDate(date: string | null | undefined): string {
  if (!date) return "—";
  try {
    return new Date(date).toLocaleDateString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
    });
  } catch {
    return date;
  }
}

export function truncate(str: string | null | undefined, max = 40): string {
  if (!str) return "";
  return str.length > max ? str.slice(0, max) + "…" : str;
}
