"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[App error boundary]", error);
  }, [error]);

  const message = String(error?.message ?? "");
  const isPermission = /không có quyền|Bạn không|chưa đăng nhập|not authorized/i.test(message);

  if (isPermission) {
    return (
      <div className="min-h-[400px] flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-4 bg-white rounded-xl border-2 border-amber-200 bg-amber-50 p-8">
          <div className="text-5xl">🔒</div>
          <h1 className="text-xl font-bold text-amber-900">Không có quyền thực hiện</h1>
          <p className="text-sm text-amber-800">{message}</p>
          <p className="text-sm text-slate-600">
            Liên hệ Quản lý nếu cần quyền này.
          </p>
          <div className="flex gap-2 justify-center pt-2">
            <button
              onClick={() => reset()}
              className="px-4 py-2 text-sm bg-slate-200 rounded hover:bg-slate-300"
            >
              Thử lại
            </button>
            <Link
              href="/"
              className="px-4 py-2 text-sm bg-orange-500 text-white rounded hover:bg-orange-600"
            >
              Về trang chủ
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[400px] flex items-center justify-center p-6">
      <div className="max-w-md text-center space-y-4 bg-white rounded-xl border-2 border-red-200 bg-red-50 p-8">
        <div className="text-5xl">⚠️</div>
        <h1 className="text-xl font-bold text-red-900">Có lỗi xảy ra</h1>
        <p className="text-sm text-red-800 bg-white rounded p-3 border border-red-200 text-left break-words">
          {message || "Lỗi không xác định"}
        </p>
        <p className="text-xs text-slate-500">
          {error?.digest && `Mã lỗi: ${error.digest}`}
        </p>
        <div className="flex gap-2 justify-center pt-2">
          <button
            onClick={() => reset()}
            className="px-4 py-2 text-sm bg-slate-200 rounded hover:bg-slate-300"
          >
            Thử lại
          </button>
          <Link
            href="/"
            className="px-4 py-2 text-sm bg-orange-500 text-white rounded hover:bg-orange-600"
          >
            Về trang chủ
          </Link>
        </div>
      </div>
    </div>
  );
}
