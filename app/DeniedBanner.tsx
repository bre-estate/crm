"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Hiển thị banner "không có quyền" từ query param `?denied=X`.
 * Sau khi mount, clean param khỏi URL bằng history.replaceState để reload
 * (F5) không hiện lại banner cũ.
 */
export default function DeniedBanner({ label }: { label: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [shown, setShown] = useState(true);

  useEffect(() => {
    // Chỉ clean nếu URL còn param denied
    if (searchParams.get("denied")) {
      const newParams = new URLSearchParams(searchParams.toString());
      newParams.delete("denied");
      const qs = newParams.toString();
      const newUrl = qs ? `${pathname}?${qs}` : pathname;
      window.history.replaceState(null, "", newUrl);
    }
  }, [pathname, searchParams]);

  if (!shown) return null;
  return (
    <div className="bg-orange-50 border border-orange-200 text-orange-800 rounded-lg p-3 text-sm flex items-start justify-between gap-3">
      <div>
        Bạn không có quyền truy cập <b>{label}</b>. Liên hệ chủ tài khoản nếu cần thêm quyền.
      </div>
      <button
        type="button"
        onClick={() => setShown(false)}
        className="text-orange-600 hover:text-orange-800 text-xs font-medium"
      >
        Đóng
      </button>
    </div>
  );
}
