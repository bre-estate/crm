import { getOwnerEmail } from "@/lib/auth";
import { notFound } from "next/navigation";
import Link from "next/link";
import { computeAlerts, type Alert } from "@/lib/alerts";

export const dynamic = "force-dynamic";

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

export default async function AlertsPage() {
  const owner = await getOwnerEmail();
  if (!owner) notFound();

  const alerts = await computeAlerts();
  const critical = alerts.filter((a) => a.severity === "critical");
  const warning = alerts.filter((a) => a.severity === "warning");
  const info = alerts.filter((a) => a.severity === "info");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">🔔 Cảnh báo</h1>
        <p className="text-sm text-slate-500 mt-1">
          {alerts.length === 0
            ? "✅ Không có cảnh báo nào — công ty đang chạy ổn."
            : `${alerts.length} cảnh báo cần chú ý. Nguy cấp trước, cảnh báo sau.`}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <SummaryCard label="Nguy cấp" count={critical.length} color="red" />
        <SummaryCard label="Cảnh báo" count={warning.length} color="amber" />
        <SummaryCard label="Thông tin" count={info.length} color="blue" />
      </div>

      {alerts.length === 0 && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
          <div className="text-4xl mb-2">✅</div>
          <div className="text-green-800 font-semibold">Không có cảnh báo nào</div>
          <div className="text-sm text-green-700 mt-1">
            Công ty đang chạy ổn — không có chỉ số nào vượt ngưỡng cần chú ý.
          </div>
        </div>
      )}

      {[...critical, ...warning, ...info].map((a) => (
        <AlertCard key={a.id} alert={a} />
      ))}
    </div>
  );
}

function SummaryCard({ label, count, color }: { label: string; count: number; color: string }) {
  const bg =
    color === "red"
      ? "bg-red-50 border-red-200 text-red-800"
      : color === "amber"
        ? "bg-amber-50 border-amber-200 text-amber-800"
        : "bg-blue-50 border-blue-200 text-blue-800";
  return (
    <div className={`border rounded-xl p-4 ${bg}`}>
      <div className="text-xs uppercase font-semibold">{label}</div>
      <div className="text-3xl font-bold tabular-nums mt-1">{count}</div>
    </div>
  );
}

function AlertCard({ alert }: { alert: Alert }) {
  const cfg = {
    critical: {
      icon: "🚨",
      border: "border-red-300",
      bg: "bg-red-50",
      titleColor: "text-red-900",
    },
    warning: {
      icon: "⚠️",
      border: "border-amber-300",
      bg: "bg-amber-50",
      titleColor: "text-amber-900",
    },
    info: {
      icon: "ℹ️",
      border: "border-blue-300",
      bg: "bg-blue-50",
      titleColor: "text-blue-900",
    },
  }[alert.severity];

  return (
    <div className={`border ${cfg.border} ${cfg.bg} rounded-xl p-4`}>
      <div className="flex items-start gap-3">
        <div className="text-2xl">{cfg.icon}</div>
        <div className="flex-1 min-w-0">
          <div className={`font-semibold ${cfg.titleColor}`}>{alert.title}</div>
          <div className="text-sm text-slate-700 mt-1">{alert.description}</div>
          <AlertDetail alert={alert} />
          {alert.url && (
            <div className="mt-3">
              <Link
                href={alert.url}
                className="text-sm text-blue-600 hover:underline font-medium"
              >
                Xem chi tiết →
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AlertDetail({ alert }: { alert: Alert }) {
  if (alert.id === "below-be-3m") {
    return (
      <ul className="list-disc list-inside text-xs mt-2 space-y-0.5">
        {alert.months.map((x) => (
          <li key={x.month}>
            {x.month}: <b>{x.count} căn</b>{" "}
            {x.count < alert.beUnits && `(thiếu ${(alert.beUnits - x.count).toFixed(1)})`}
          </li>
        ))}
      </ul>
    );
  }
  if (alert.id === "idle-sale") {
    return (
      <ul className="list-disc list-inside text-xs mt-2 space-y-0.5">
        {alert.emps.slice(0, 10).map((e) => (
          <li key={e.name}>
            <b>{e.name}</b> — lần đối chiếu hoa hồng cuối: {e.lastSale ?? "chưa có"}
          </li>
        ))}
        {alert.emps.length > 10 && (
          <li className="italic">... và {alert.emps.length - 10} người khác</li>
        )}
      </ul>
    );
  }
  if (alert.id === "opex-spike") {
    return (
      <ul className="list-disc list-inside text-xs mt-2 space-y-0.5">
        {alert.months.map((s) => (
          <li key={s.month}>
            <b>{s.month}</b>: {fmt(s.amount)} VND ({s.ratio.toFixed(1)} lần trung bình)
            {" · "}
            <Link
              href={`/reports/management/${s.month}`}
              className="text-blue-600 hover:underline"
            >
              Xem chi tiết →
            </Link>
          </li>
        ))}
      </ul>
    );
  }
  if (alert.id === "overdue-receivables") {
    const top = alert.products.slice(0, 10);
    return (
      <table className="w-full text-xs mt-2">
        <thead className="bg-slate-100">
          <tr>
            <th className="text-left p-1">Căn</th>
            <th className="text-right p-1">Còn phải thu</th>
            <th className="text-left p-1">Đối chiếu cũ nhất</th>
            <th className="text-center p-1">Số đợt</th>
          </tr>
        </thead>
        <tbody>
          {top.map((x) => (
            <tr key={x.productId} className="border-t border-slate-200">
              <td className="p-1">
                <Link
                  href={`/products/${x.productId}`}
                  className="text-blue-600 hover:underline font-mono"
                >
                  {x.unitCode}
                </Link>
              </td>
              <td className="p-1 text-right tabular-nums">{fmt(x.total)}</td>
              <td className="p-1 font-mono">{x.oldestDate}</td>
              <td className="p-1 text-center">{x.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  return null;
}
