"use client";

import { useEffect, useState } from "react";

/**
 * Thông báo sau khi quay về từ Google. Tự tắt sau 10 giây rồi dọn luôn tham số
 * trên thanh địa chỉ, để tải lại trang không thấy nó hiện lại.
 */
export default function ThongBao({ noiDung, loi }: { noiDung: string; loi?: boolean }) {
  const [hien, setHien] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => {
      setHien(false);
      const u = new URL(window.location.href);
      u.searchParams.delete("ok");
      u.searchParams.delete("loi");
      window.history.replaceState(null, "", u.toString());
    }, 10000);
    return () => clearTimeout(t);
  }, []);

  if (!hien) return null;
  const mau = loi
    ? "text-red-800 bg-red-50 border-red-200"
    : "text-green-800 bg-green-50 border-green-200";
  return <p className={`text-sm border rounded-lg p-3 ${mau}`}>{noiDung}</p>;
}
