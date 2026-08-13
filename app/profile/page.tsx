import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import ProfileForm from "./ProfileForm";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  owner: "Chủ tài khoản",
  manager: "Quản lý",
  sale: "Nhân viên kinh doanh",
  admin: "Kế toán / Admin",
  hr: "Nhân sự",
  viewer: "Xem báo cáo",
  custom: "Tùy chỉnh",
};

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <div className="text-xs">
          <Link href="/" className="text-blue-600 hover:underline">← Trang chủ</Link>
        </div>
        <h1 className="text-2xl font-bold mt-1">Trang cá nhân</h1>
        <p className="text-sm text-slate-500 mt-1">
          Chỉnh sửa họ tên hiển thị và đổi mật khẩu. Email + vai trò do Quản lý cấp.
        </p>
      </div>

      <div className="bg-card rounded-xl ring-1 ring-foreground/10 p-5 space-y-4">
        <div>
          <div className="text-xs text-slate-500 mb-1">Email</div>
          <div className="text-sm font-mono">{user.email}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500 mb-1">Vai trò</div>
          <div className="text-sm">{ROLE_LABEL[user.role] ?? user.role}</div>
        </div>
      </div>

      <ProfileForm defaultFullName={user.fullName ?? ""} />
    </div>
  );
}
