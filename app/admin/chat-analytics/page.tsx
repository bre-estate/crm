import { requireOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import Link from "next/link";

export const dynamic = "force-dynamic";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

// Phân nhóm câu hỏi đơn giản qua keyword. Đủ cho POC; sau có thể nâng
// cấp bằng LLM classify hoặc embedding cluster.
function categorize(q: string, tools: string[]): string {
  const t = tools[0] ?? "";
  if (t === "getEmployeeCommission" || t === "getAPAging") return "HH sale + công nợ NV";
  if (t === "getARAging" || t === "listUnitsNeedingCollection") return "CĐT nợ / còn thu";
  if (t === "getUnitInfo" || t === "listUnitsMissingHHRecon") return "Thông tin căn";
  if (t === "listUnitsByProject" || t === "getProjectPolicy" || t === "listAllProjectPolicies" || t === "getTopProjects") return "Dự án / CĐT";
  if (t === "getSalesReport" || t === "getProjectProfitability") return "Doanh thu / Lãi lỗ";
  if (t === "getPnL" || t === "getBreakEven" || t === "getObligations") return "Tài chính công ty";
  if (t === "getEmployeeOverpaidList") return "Chi dư nội bộ";
  // Câu không call tool → chatbot refuse hoặc gợi ý
  const ql = q.toLowerCase();
  if (ql.includes("chính sách") || ql.includes("tốt nhất")) return "So sánh / phân tích";
  return "Khác / ngoài scope";
}

export default async function ChatAnalyticsPage() {
  await requireOwner();

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);

  // Summary
  const [{ total, success, failed, uniqUsers, avgLatency }] = (await db.execute(sql`
    SELECT
      COUNT(*)::int AS total,
      SUM(CASE WHEN success THEN 1 ELSE 0 END)::int AS success,
      SUM(CASE WHEN NOT success THEN 1 ELSE 0 END)::int AS failed,
      COUNT(DISTINCT user_email)::int AS "uniqUsers",
      AVG(latency_ms)::int AS "avgLatency"
    FROM chat_logs
  `)) as unknown as Array<{ total: number; success: number; failed: number; uniqUsers: number; avgLatency: number }>;

  const [{ todayCnt, weekCnt }] = (await db.execute(sql`
    SELECT
      SUM(CASE WHEN created_at::date = ${today}::date THEN 1 ELSE 0 END)::int AS "todayCnt",
      SUM(CASE WHEN created_at::date >= ${weekAgo}::date THEN 1 ELSE 0 END)::int AS "weekCnt"
    FROM chat_logs
  `)) as unknown as Array<{ todayCnt: number; weekCnt: number }>;

  // Recent logs (last 100)
  const recent = (await db.execute(sql`
    SELECT id, user_email, user_role, question, answer, tools_used, success, error_message, latency_ms, created_at
    FROM chat_logs
    ORDER BY created_at DESC
    LIMIT 100
  `)) as unknown as Array<{
    id: number;
    user_email: string;
    user_role: string | null;
    question: string;
    answer: string | null;
    tools_used: string[];
    success: boolean;
    error_message: string | null;
    latency_ms: number | null;
    created_at: string;
  }>;

  // Tool usage frequency
  const toolStats = (await db.execute(sql`
    SELECT tool AS name, COUNT(*)::int AS n
    FROM chat_logs, jsonb_array_elements_text(tools_used) AS tool
    GROUP BY tool
    ORDER BY n DESC
  `)) as unknown as Array<{ name: string; n: number }>;

  // Group by category
  const categoryStats = new Map<string, { count: number; successCount: number }>();
  for (const r of recent) {
    const cat = categorize(r.question, (r.tools_used as string[]) ?? []);
    const cur = categoryStats.get(cat) ?? { count: 0, successCount: 0 };
    cur.count++;
    if (r.success) cur.successCount++;
    categoryStats.set(cat, cur);
  }
  const categoryList = Array.from(categoryStats.entries())
    .map(([name, v]) => ({ name, count: v.count, successRate: (v.successCount / v.count) * 100 }))
    .sort((a, b) => b.count - a.count);

  // Users
  const userStats = (await db.execute(sql`
    SELECT user_email, COUNT(*)::int AS n,
      SUM(CASE WHEN success THEN 1 ELSE 0 END)::int AS s
    FROM chat_logs
    GROUP BY user_email
    ORDER BY n DESC
    LIMIT 20
  `)) as unknown as Array<{ user_email: string; n: number; s: number }>;

  // Failed queries only (for optimization)
  const failedList = recent.filter((r) => !r.success).slice(0, 30);

  const successRate = total > 0 ? (success / total) * 100 : 0;

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs">
          <Link href="/admin" className="text-blue-600 hover:underline">← Quản trị</Link>
        </div>
        <h1 className="text-2xl font-bold mt-1">Phân tích Trợ lý CRM</h1>
        <p className="text-sm text-slate-500 mt-1">
          Câu hỏi thường gặp, tỷ lệ trả lời được, tool được dùng nhiều nhất.
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <Card label="Tổng câu hỏi" value={fmt(total ?? 0)} color="slate" />
        <Card label="Hôm nay" value={fmt(todayCnt ?? 0)} color="blue" />
        <Card label="7 ngày qua" value={fmt(weekCnt ?? 0)} color="indigo" />
        <Card
          label="Tỷ lệ trả lời được"
          value={`${successRate.toFixed(1)}%`}
          color={successRate >= 90 ? "green" : successRate >= 70 ? "amber" : "red"}
        />
        <Card label="Số user hỏi" value={fmt(uniqUsers ?? 0)} color="slate" />
        <Card label="Latency TB" value={`${((avgLatency ?? 0) / 1000).toFixed(1)}s`} color="slate" />
      </div>

      {/* Category breakdown */}
      <div className="bg-card rounded-xl ring-1 ring-foreground/10 p-4">
        <h2 className="text-sm font-semibold mb-3">Phân nhóm câu hỏi (100 gần nhất)</h2>
        {categoryList.length === 0 ? (
          <div className="text-sm text-slate-400 italic">Chưa có data</div>
        ) : (
          <div className="space-y-2">
            {categoryList.map((c) => (
              <div key={c.name} className="flex items-center gap-3 text-sm">
                <div className="w-48 font-medium">{c.name}</div>
                <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full bg-orange-500 rounded-full"
                    style={{ width: `${(c.count / categoryList[0].count) * 100}%` }}
                  />
                </div>
                <div className="w-12 text-right tabular-nums">{c.count}</div>
                <div className={`w-16 text-right text-xs ${c.successRate >= 90 ? "text-green-600" : c.successRate >= 70 ? "text-amber-600" : "text-red-600"}`}>
                  {c.successRate.toFixed(0)}% OK
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tool usage */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-card rounded-xl ring-1 ring-foreground/10 p-4">
          <h2 className="text-sm font-semibold mb-3">Tool được dùng nhiều nhất</h2>
          {toolStats.length === 0 ? (
            <div className="text-sm text-slate-400 italic">Chưa có data</div>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {toolStats.slice(0, 15).map((t) => (
                  <tr key={t.name} className="border-t border-slate-100">
                    <td className="py-1.5 font-mono text-xs">{t.name}</td>
                    <td className="py-1.5 text-right tabular-nums">{t.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="bg-card rounded-xl ring-1 ring-foreground/10 p-4">
          <h2 className="text-sm font-semibold mb-3">Top user hỏi nhiều</h2>
          {userStats.length === 0 ? (
            <div className="text-sm text-slate-400 italic">Chưa có data</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs text-slate-500">
                <tr>
                  <th className="text-left py-1">Email</th>
                  <th className="text-right py-1">Tổng</th>
                  <th className="text-right py-1">OK</th>
                </tr>
              </thead>
              <tbody>
                {userStats.map((u) => (
                  <tr key={u.user_email} className="border-t border-slate-100">
                    <td className="py-1.5 text-xs">{u.user_email}</td>
                    <td className="py-1.5 text-right tabular-nums">{u.n}</td>
                    <td className="py-1.5 text-right tabular-nums text-green-700">{u.s}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Failed queries — để optimize */}
      {failedList.length > 0 && (
        <div className="bg-card rounded-xl ring-1 ring-foreground/10 overflow-hidden">
          <div className="p-3 bg-red-50 border-b border-red-100">
            <h2 className="text-sm font-semibold text-red-800">
              ⚠️ Câu hỏi bot KHÔNG trả lời được ({failedList.length})
            </h2>
            <p className="text-xs text-red-600 mt-0.5">
              Dùng để tối ưu: thêm tool mới hoặc điều chỉnh prompt.
            </p>
          </div>
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-slate-500 bg-slate-50">
                <tr>
                  <th className="text-left p-2">Thời điểm</th>
                  <th className="text-left p-2">User</th>
                  <th className="text-left p-2">Câu hỏi</th>
                  <th className="text-left p-2">Lỗi</th>
                </tr>
              </thead>
              <tbody>
                {failedList.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="p-2 text-xs text-slate-500 whitespace-nowrap">
                      {new Date(r.created_at).toLocaleString("vi-VN")}
                    </td>
                    <td className="p-2 text-xs">{r.user_email}</td>
                    <td className="p-2 text-xs">{r.question}</td>
                    <td className="p-2 text-xs text-red-600">
                      {r.error_message ?? r.answer?.slice(0, 100) ?? "(không có)"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent logs */}
      <div className="bg-card rounded-xl ring-1 ring-foreground/10 overflow-hidden">
        <div className="p-3 border-b border-slate-100">
          <h2 className="text-sm font-semibold">Log câu hỏi gần đây (100)</h2>
        </div>
        <div className="max-h-[600px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500 bg-slate-50 sticky top-0">
              <tr>
                <th className="text-left p-2">Thời điểm</th>
                <th className="text-left p-2">User</th>
                <th className="text-left p-2">Câu hỏi</th>
                <th className="text-left p-2">Tool</th>
                <th className="text-right p-2">Latency</th>
                <th className="text-center p-2">Kết quả</th>
              </tr>
            </thead>
            <tbody>
              {recent.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-slate-400 italic">
                    Chưa có log nào. Hãy hỏi vài câu qua chatbot trước.
                  </td>
                </tr>
              )}
              {recent.map((r) => (
                <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="p-2 text-xs text-slate-500 whitespace-nowrap">
                    {new Date(r.created_at).toLocaleString("vi-VN")}
                  </td>
                  <td className="p-2 text-xs">{r.user_email}</td>
                  <td className="p-2 text-xs max-w-xs">{r.question}</td>
                  <td className="p-2 text-xs font-mono">
                    {((r.tools_used as string[]) ?? []).slice(0, 2).join(", ") || "-"}
                  </td>
                  <td className="p-2 text-xs text-right tabular-nums">
                    {r.latency_ms ? `${(r.latency_ms / 1000).toFixed(1)}s` : "-"}
                  </td>
                  <td className="p-2 text-center">
                    {r.success ? (
                      <span className="text-green-600 text-xs">✓</span>
                    ) : (
                      <span className="text-red-600 text-xs">✗</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Card({ label, value, color }: { label: string; value: string; color: string }) {
  const cls: Record<string, string> = {
    slate: "bg-slate-50 border-slate-200 text-slate-800",
    blue: "bg-blue-50 border-blue-200 text-blue-800",
    indigo: "bg-indigo-50 border-indigo-200 text-indigo-800",
    green: "bg-green-50 border-green-200 text-green-800",
    amber: "bg-amber-50 border-amber-200 text-amber-800",
    red: "bg-red-50 border-red-200 text-red-800",
  };
  return (
    <div className={`rounded-xl border p-3 ${cls[color]}`}>
      <div className="text-[11px] uppercase tracking-wide font-semibold opacity-80">{label}</div>
      <div className="text-lg font-bold tabular-nums mt-1">{value}</div>
    </div>
  );
}
