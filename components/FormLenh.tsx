"use client";

import { useTransition, type ReactNode } from "react";
import { baoLoi } from "@/lib/bao-loi";

/**
 * Form chạy một lệnh server và hiện lý do nếu không chạy được.
 *
 * Dùng thay cho <form action={...}> đặt thẳng trong server component: kiểu đó
 * không có chỗ nào hiện lỗi, lệnh hỏng là im lặng luôn, người dùng bấm mãi không hiểu.
 */
export default function FormLenh({
  lenh,
  xacNhan,
  className,
  children,
}: {
  lenh: (fd: FormData) => Promise<{ error: string } | void>;
  /** Câu hỏi xác nhận trước khi chạy. Bỏ trống thì chạy ngay. */
  xacNhan?: string;
  className?: string;
  children: ReactNode;
}) {
  const [dangChay, start] = useTransition();
  return (
    <form
      className={className}
      aria-busy={dangChay}
      action={(fd) => {
        if (xacNhan && !window.confirm(xacNhan)) return;
        start(async () => {
          baoLoi(await lenh(fd));
        });
      }}
    >
      {children}
    </form>
  );
}
