"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { updateFullName, updatePassword } from "@/lib/actions/profile";

export default function ProfileForm({ defaultFullName }: { defaultFullName: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [fullName, setFullName] = useState(defaultFullName);
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");

  const saveName = () => {
    if (fullName.trim() === defaultFullName.trim()) {
      toast.info("Họ tên không thay đổi");
      return;
    }
    start(async () => {
      try {
        await updateFullName(fullName);
        toast.success("Đã cập nhật họ tên");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Lỗi lưu");
      }
    });
  };

  const changePw = () => {
    if (newPw.length < 8) {
      toast.error("Mật khẩu mới phải ≥ 8 ký tự");
      return;
    }
    if (newPw !== confirmPw) {
      toast.error("Xác nhận mật khẩu không khớp");
      return;
    }
    start(async () => {
      try {
        await updatePassword(newPw);
        toast.success("Đã đổi mật khẩu");
        setNewPw("");
        setConfirmPw("");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Lỗi đổi mật khẩu");
      }
    });
  };

  return (
    <>
      <div className="bg-card rounded-xl ring-1 ring-foreground/10 p-5 space-y-3">
        <div>
          <h2 className="font-semibold text-slate-800">Họ tên hiển thị</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Xuất hiện ở góc trái sidebar và trong lịch sử hoạt động.
          </p>
        </div>
        <input
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          maxLength={100}
          className="input"
          placeholder="Nguyễn Văn A"
        />
        <div className="flex justify-end">
          <Button
            type="button"
            onClick={saveName}
            disabled={pending}
            className="bg-orange-500 hover:bg-orange-600 text-white"
          >
            {pending ? "Đang lưu..." : "Lưu họ tên"}
          </Button>
        </div>
      </div>

      <div className="bg-card rounded-xl ring-1 ring-foreground/10 p-5 space-y-3">
        <div>
          <h2 className="font-semibold text-slate-800">Đổi mật khẩu</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Tối thiểu 8 ký tự. Sau khi đổi, các phiên đăng nhập khác vẫn hoạt động.
          </p>
        </div>
        <div>
          <label className="block text-xs text-slate-600 mb-1">Mật khẩu mới</label>
          <input
            type="password"
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
            autoComplete="new-password"
            className="input"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-600 mb-1">Xác nhận mật khẩu mới</label>
          <input
            type="password"
            value={confirmPw}
            onChange={(e) => setConfirmPw(e.target.value)}
            autoComplete="new-password"
            className="input"
          />
        </div>
        <div className="flex justify-end">
          <Button
            type="button"
            onClick={changePw}
            disabled={pending || !newPw}
            className="bg-orange-500 hover:bg-orange-600 text-white"
          >
            {pending ? "Đang đổi..." : "Đổi mật khẩu"}
          </Button>
        </div>
      </div>
    </>
  );
}
