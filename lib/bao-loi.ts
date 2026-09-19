"use client";

import { toast } from "sonner";

/**
 * Hiện lỗi mà lệnh server trả về. Dùng ở mọi form:
 *
 *   baoLoi(await onSave(fd));
 *
 * Để 10 giây vì câu báo lỗi nghiệp vụ thường dài, 4 giây mặc định đọc không kịp.
 * Trả về true nếu có lỗi, để nơi gọi biết mà dừng các bước sau.
 */
export function baoLoi(ketQua: { error?: string } | void | null): boolean {
  if (ketQua && "error" in ketQua && ketQua.error) {
    toast.error(ketQua.error, { duration: 10000 });
    return true;
  }
  return false;
}
