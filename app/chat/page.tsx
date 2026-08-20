import { requirePermission } from "@/lib/auth";
import ChatUI from "./ChatUI";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  await requirePermission("reports.commissions", "view");
  return (
    <div className="space-y-3">
      <div className="border-b border-slate-100 pb-2">
        <h1 className="text-2xl font-bold">Trợ lý CRM</h1>
        <p className="text-sm text-slate-500 mt-1">
          Hỏi số liệu HH, thưởng nóng, thông tin căn bằng tiếng Việt tự nhiên. Bản POC.
        </p>
      </div>
      <ChatUI />
    </div>
  );
}
