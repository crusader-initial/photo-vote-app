import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { getApiBaseUrl } from "@/constants/oauth";

/**
 * Combines class names using clsx and tailwind-merge.
 * This ensures Tailwind classes are properly merged without conflicts.
 *
 * Usage:
 * ```tsx
 * cn("px-4 py-2", isActive && "bg-primary", className)
 * ```
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Normalize image URLs for different runtime environments.
 * - Keeps absolute URLs as-is (unless they point to localhost on device).
 * - Expands protocol-relative URLs (//) to https.
 * - Expands relative paths (/uploads/...) using API base URL.
 */
export function getImageUrl(url: string): string {
  if (!url || typeof url !== "string") return url as string;
  const trimmed = url.trim();
  if (!trimmed) return trimmed;

  // Data/file/blob/content URLs should be used as-is.
  if (/^(data:|file:|content:|blob:)/i.test(trimmed)) return trimmed;

  // Protocol-relative URLs -> https
  if (trimmed.startsWith("//")) return `https:${trimmed}`;

  // Absolute URLs
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      const base = getApiBaseUrl();
      if (base) {
        const baseUrl = new URL(base);
        if (["localhost", "127.0.0.1", "0.0.0.0"].includes(parsed.hostname)) {
          parsed.protocol = baseUrl.protocol;
          parsed.hostname = baseUrl.hostname;
          parsed.port = baseUrl.port;
          return parsed.toString();
        }
      }
    } catch {
      // Fall through to return original.
    }
    return trimmed;
  }

  // Relative path -> prefix API base URL
  const base = getApiBaseUrl();
  if (!base) return trimmed;
  return `${base.replace(/\/+$/, "")}/${trimmed.replace(/^\/+/, "")}`;
}
