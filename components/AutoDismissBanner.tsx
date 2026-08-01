"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type Variant = "success" | "error" | "info";

/**
 * Banner tự ẩn sau `timeoutMs` (mặc định 6s). Sau khi ẩn:
 *  - Fade opacity 500ms
 *  - Xóa các query params trong `clearParams` khỏi URL (history.replaceState)
 *    để banner không quay lại khi user F5.
 */
export default function AutoDismissBanner({
  children,
  variant = "success",
  timeoutMs = 6000,
  clearParams = [],
  className,
}: {
  children: React.ReactNode;
  variant?: Variant;
  timeoutMs?: number;
  clearParams?: string[];
  className?: string;
}) {
  const [fading, setFading] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const fadeAt = Math.max(0, timeoutMs - 500);
    const t1 = setTimeout(() => setFading(true), fadeAt);
    const t2 = setTimeout(() => {
      setGone(true);
      if (clearParams.length > 0 && typeof window !== "undefined") {
        const url = new URL(window.location.href);
        let touched = false;
        for (const p of clearParams) {
          if (url.searchParams.has(p)) {
            url.searchParams.delete(p);
            touched = true;
          }
        }
        if (touched) {
          window.history.replaceState({}, "", url.toString());
        }
      }
    }, timeoutMs);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
    // clearParams là stable prop từ server; không watch để tránh loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeoutMs]);

  if (gone) return null;

  const color =
    variant === "error"
      ? "bg-red-50 border-red-300 text-red-800"
      : variant === "info"
        ? "bg-blue-50 border-blue-300 text-blue-800"
        : "bg-green-50 border-green-300 text-green-800";

  return (
    <div
      className={cn(
        "border rounded-lg p-3 text-sm transition-opacity duration-500",
        color,
        fading && "opacity-0",
        className,
      )}
    >
      {children}
    </div>
  );
}
