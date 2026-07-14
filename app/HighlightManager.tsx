"use client";

import { useEffect } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

/**
 * Chạy sau khi trang render có row [data-just-created="1"]:
 *   1. Scroll row đầu tiên vào giữa viewport (nếu ngoài viewport)
 *   2. Sau 4s (dài hơn CSS animation 3.5s) → xóa ?justCreated khỏi URL
 *      để F5 không hiện lại highlight
 *
 * Đặt <HighlightManager /> ở top-level của bất kỳ list page nào có
 * highlight-fade class. Không render gì.
 */
export default function HighlightManager() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const justCreated = searchParams.get("justCreated");

  useEffect(() => {
    if (!justCreated) return;

    // Scroll first highlighted row vào giữa viewport
    const first = document.querySelector<HTMLElement>('[data-just-created="1"]');
    if (first) {
      const rect = first.getBoundingClientRect();
      const outOfView = rect.top < 0 || rect.bottom > window.innerHeight;
      if (outOfView) {
        first.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }

    // Sau 4s → clean URL (không reload)
    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("justCreated");
      const qs = params.toString();
      router.replace(`${pathname}${qs ? "?" + qs : ""}`, { scroll: false });
    }, 4000);

    return () => clearTimeout(timer);
  }, [justCreated, router, pathname, searchParams]);

  return null;
}
