import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

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
 * 网页在 localhost 时，将图片 URL 重写为 localhost:3000，否则浏览器可能加载不到
 * （数据库里存的是 EXPO_PUBLIC_API_BASE_URL，如手机调试 IP）
 */
export function getImageUrl(url: string): string {
  if (!url || typeof url !== "string") return url;
  return url;
}
