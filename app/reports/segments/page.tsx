import Link from "next/link";
import { redirect } from "next/navigation";
import { fmtMoney, fmtPctRaw } from "@/lib/format";
import { hasSegmentsAccess } from "@/lib/auth";
import { loadReportData, parseFilters } from "@/lib/reports";
import { ReportsHeader } from "../_shared";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ year?: string; range?: string }>;

const BEDROOM_LABEL: Record<string, string> = {
  "0": "Studio",
  "1": "1 PN",
  "2": "2 PN",
  "3": "3 PN",
  "4": "4 PN",
  penthouse: "Penthouse",
  duplex: "Duplex",
  shophouse: "Shophouse",
  commercial: "TMDV",
};

const PRICE_BUCKETS: { label: string; min: number; max: number }[] = [
  { label: "< 2 tỷ", min: 0, max: 2_000_000_000 },
  { label: "2 – 3 tỷ", min: 2_000_000_000, max: 3_000_000_000 },
  { label: "3 – 5 tỷ", min: 3_000_000_000, max: 5_000_000_000 },
  { label: "5 – 10 tỷ", min: 5_000_000_000, max: 10_000_000_000 },
  { label: "≥ 10 tỷ", min: 10_000_000_000, max: Infinity },
];

function bucketOf(price: number): string {
  const b = PRICE_BUCKETS.find((x) => price >= x.min && price < x.max);
  return b?.label ?? "(chưa có giá)";
}

export default async function ReportsSegmentsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  if (!(await hasSegmentsAccess())) redirect("/");
  const sp = await searchParams;
  const filters = parseFilters(sp);
  const data = await loadReportData(filters);
  const { grandTotals, prodRows, filterLabel, yearOptions } = data;

  // ===== Group by unit_type + bedrooms + bonus room flag =====
  type BedroomAgg = { key: string; label: string; units: number; revenue: number; areaSum: number; areaCount: number };
  const bedroomMap = new Map<string, BedroomAgg>();
  for (const p of prodRows) {
    let key: string;
    let label: string;
    if (p.unitType === "penthouse") {
      key = "penthouse";
      label = "Penthouse";
    } else if (p.unitType === "duplex") {
      key = "duplex";
      label = "Duplex";
    } else if (p.unitType === "shophouse") {
      key = "shophouse";
      label = "Shophouse";
    } else if (p.unitType === "commercial") {
      key = "commercial";
      label = "TMDV";
    } else if (p.bedrooms == null) {
      key = "unknown";
      label = "Chưa xác định";
    } else {
      const suffix = p.hasBonusRoom ? "+" : "";
      key = `${p.bedrooms}${suffix}`;
      const base = BEDROOM_LABEL[String(p.bedrooms)] ?? `${p.bedrooms} PN`;
      label = p.hasBonusRoom ? `${base}+` : base;
    }
    if (!bedroomMap.has(key))
      bedroomMap.set(key, { key, label, units: 0, revenue: 0, areaSum: 0, areaCount: 0 });
    const agg = bedroomMap.get(key)!;
    agg.units++;
    agg.revenue += Number(p.totalRevenue ?? 0);
    const area = p.areaM2Net ?? p.areaM2Gross;
    if (area && area > 0) {
      agg.areaSum += area;
      agg.areaCount++;
    }
  }
  const totalUnits = prodRows.length;
  const totalRevenue = prodRows.reduce((s, p) => s + Number(p.totalRevenue ?? 0), 0);
  const bedroomRows = [...bedroomMap.values()]
    .sort((a, b) => b.units - a.units);
  const maxBedroomUnits = bedroomRows[0]?.units ?? 1;

  // ===== Group by price bucket =====
  // Dùng pmg_base_price = giá bán căn thực cho khách (~3-6 tỷ);
  // KHÔNG dùng sell_price vì Excel lưu sell_price = DT BRE nhận (~200 triệu HH).
  type PriceAgg = { label: string; units: number; revenue: number };
  const priceMap = new Map<string, PriceAgg>();
  for (const p of prodRows) {
    const price = Number(p.pmgBasePrice ?? 0);
    const key = price > 0 ? bucketOf(price) : "(chưa có giá)";
    if (!priceMap.has(key)) priceMap.set(key, { label: key, units: 0, revenue: 0 });
    const agg = priceMap.get(key)!;
    agg.units++;
    agg.revenue += Number(p.totalRevenue ?? 0);
  }
  // Sắp theo thứ tự bucket
  const priceRows = PRICE_BUCKETS.map((b) => priceMap.get(b.label) ?? { label: b.label, units: 0, revenue: 0 });
  if (priceMap.has("(chưa có giá)")) priceRows.push(priceMap.get("(chưa có giá)")!);
  const maxPriceUnits = Math.max(...priceRows.map((r) => r.units), 1);

  // ===== Bedroom × Project (heatmap-ish table) =====
  type ProjectBedroomRow = {
    project: string;
    partner: string | null;
    total: number;
    byBedroom: Record<string, number>;
  };
  const bedroomKeyOf = (p: typeof prodRows[number]): string => {
    if (p.unitType === "penthouse") return "penthouse";
    if (p.unitType === "duplex") return "duplex";
    if (p.unitType === "shophouse") return "shophouse";
    if (p.unitType === "commercial") return "commercial";
    if (p.bedrooms == null) return "unknown";
    return `${p.bedrooms}${p.hasBonusRoom ? "+" : ""}`;
  };
  const bedroomLabelOf = (key: string): string => {
    if (key === "unknown") return "Chưa xđ";
    if (key === "penthouse") return "Penthouse";
    if (key === "duplex") return "Duplex";
    if (key === "shophouse") return "Shophouse";
    if (key === "commercial") return "TMDV";
    const [base, plus] = [key.replace("+", ""), key.endsWith("+")];
    const b = BEDROOM_LABEL[base] ?? `${base}PN`;
    return plus ? `${b}+` : b;
  };
  const byProject = new Map<string, ProjectBedroomRow>();
  for (const p of prodRows) {
    const proj = data.aggregatedProjects.find((ap) => ap.id === p.projectId);
    const projName = proj?.name ?? "?";
    if (!byProject.has(projName))
      byProject.set(projName, { project: projName, partner: proj?.partnerName ?? null, total: 0, byBedroom: {} });
    const row = byProject.get(projName)!;
    row.total++;
    const key = bedroomKeyOf(p);
    row.byBedroom[key] = (row.byBedroom[key] ?? 0) + 1;
  }
  const projRows = [...byProject.values()].sort((a, b) => b.total - a.total);
  const bedroomKeys = [...new Set(prodRows.map(bedroomKeyOf))].sort((a, b) => {
    // Order: 0 < 0+ < 1 < 1+ < ... < penthouse < duplex < shophouse < TMDV < unknown
    const rank = (k: string): number => {
      if (k === "unknown") return 9999;
      if (k === "commercial") return 950;
      if (k === "shophouse") return 900;
      if (k === "duplex") return 850;
      if (k === "penthouse") return 800;
      const n = Number(k.replace("+", ""));
      return n * 10 + (k.endsWith("+") ? 1 : 0);
    };
    return rank(a) - rank(b);
  });

  // ===== Danh sách căn cần review: parse_note hoặc thiếu số PN / loại căn / diện tích =====
  const needReview = prodRows
    .map((p) => {
      const reasons: string[] = [];
      if (p.parseNote) reasons.push(p.parseNote);
      if (p.unitType == null) reasons.push("chưa có loại căn");
      // Số PN chỉ bắt buộc với apartment (penthouse/duplex/shophouse/TMDV không cần)
      if ((p.unitType == null || p.unitType === "apartment") && p.bedrooms == null) {
        reasons.push("chưa có số PN");
      }
      if (p.areaM2Net == null && p.areaM2Gross == null) {
        reasons.push("chưa có diện tích");
      } else if (p.areaM2Net == null) {
        reasons.push("chưa có diện tích thông thủy");
      }
      return { ...p, reasons };
    })
    .filter((p) => p.reasons.length > 0);

  // ===== Diện tích m² TB per bedroom (nếu có) =====
  const areaByBedroom = bedroomRows.filter((b) => b.areaCount > 0).map((b) => ({
    label: b.label,
    avg: b.areaSum / b.areaCount,
    count: b.areaCount,
  }));

  return (
    <div className="space-y-6">
      <ReportsHeader
        activePath="/reports/segments"
        filters={filters}
        yearOptions={yearOptions}
        filterLabel={filterLabel}
        totalProducts={grandTotals.products}
      />

      {/* Progress: coverage của bedrooms + area */}
      {(() => {
        // Duplex/Penthouse/Shophouse/TMDV không cần số PN → tính là đã đủ data
        const NO_BEDROOM_TYPES = new Set(["duplex", "penthouse", "shophouse", "commercial"]);
        const withBedrooms = prodRows.filter(
          (p) => p.bedrooms !== null || (p.unitType && NO_BEDROOM_TYPES.has(p.unitType)),
        ).length;
        const withNet = prodRows.filter((p) => p.areaM2Net && p.areaM2Net > 0).length;
        const withGross = prodRows.filter((p) => p.areaM2Gross && p.areaM2Gross > 0).length;
        const bedPct = totalUnits > 0 ? (withBedrooms / totalUnits) * 100 : 0;
        const netPct = totalUnits > 0 ? (withNet / totalUnits) * 100 : 0;
        const grossPct = totalUnits > 0 ? (withGross / totalUnits) * 100 : 0;
        if (totalUnits === 0) return null;
        // Nếu đủ 100% cả 3 chỉ số → ẩn hộp cảnh báo (không cần nhắc user nữa)
        const fullyCovered = withBedrooms === totalUnits && withNet === totalUnits && withGross === totalUnits;
        if (fullyCovered) return null;
        return (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
            <div className="font-semibold mb-1">📊 Độ phủ dữ liệu phân khúc:</div>
            <div className="grid grid-cols-3 gap-4 text-xs">
              <div>
                <b>Số PN:</b> {withBedrooms}/{totalUnits} ({fmtPctRaw(bedPct, 0)})
              </div>
              <div>
                <b>DT thông thủy:</b> {withNet}/{totalUnits} ({fmtPctRaw(netPct, 0)})
              </div>
              <div>
                <b>DT tim tường:</b> {withGross}/{totalUnits} ({fmtPctRaw(grossPct, 0)})
              </div>
            </div>
            {needReview.length > 0 && (
              <div className="mt-2 text-xs">
                Còn <b>{needReview.length}</b> căn chưa có data đầy đủ — xem list "Cần check tay" cuối trang để bổ sung.
              </div>
            )}
          </div>
        );
      })()}

      {/* ===== Bedroom breakdown ===== */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Phân khúc theo số phòng ngủ — {filterLabel}</h2>
        <div className="bg-card rounded-xl ring-1 ring-foreground/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600">
              <tr>
                <th className="text-left p-2">Loại</th>
                <th className="text-right p-2">Số căn</th>
                <th className="text-right p-2 w-64">% trên tổng</th>
                <th className="text-right p-2">Tổng DT (gồm VAT)</th>
                <th className="text-right p-2">Diện tích TB</th>
              </tr>
            </thead>
            <tbody>
              {bedroomRows.map((r) => {
                const pct = totalUnits > 0 ? (r.units / totalUnits) * 100 : 0;
                const barPct = maxBedroomUnits > 0 ? (r.units / maxBedroomUnits) * 100 : 0;
                const isUnknown = r.key === "unknown";
                return (
                  <tr key={r.key} className={`border-t border-slate-100 ${isUnknown ? "bg-amber-50" : ""}`}>
                    <td className="p-2 font-medium">
                      {isUnknown ? <span className="text-amber-700">⚠️ {r.label}</span> : r.label}
                    </td>
                    <td className="p-2 text-right tabular-nums">{r.units}</td>
                    <td className="p-2">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-3 bg-slate-100 rounded overflow-hidden">
                          <div
                            className={`h-full ${isUnknown ? "bg-amber-500" : "bg-blue-500"}`}
                            style={{ width: `${barPct}%` }}
                          />
                        </div>
                        <div className="text-right tabular-nums font-medium w-16 text-xs">
                          {fmtPctRaw(pct, 1)}
                        </div>
                      </div>
                    </td>
                    <td className="p-2 text-right tabular-nums text-xs">{fmtMoney(r.revenue)}</td>
                    <td className="p-2 text-right tabular-nums text-xs text-slate-500">
                      {r.areaCount > 0
                        ? `${(r.areaSum / r.areaCount).toFixed(1)} m² (${r.areaCount} căn)`
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===== Price bucket ===== */}
      <div>
        <h2 className="text-lg font-semibold mb-1">Phân khúc theo tầm giá — {filterLabel}</h2>
        <p className="text-xs text-slate-500 mb-3">
          Dựa trên <b>Giá tính PMG</b> (giá bán căn cho khách). Cột "Tổng DT" = doanh thu BRE nhận từ CĐT (HH), khác với giá bán.
        </p>
        <div className="bg-card rounded-xl ring-1 ring-foreground/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600">
              <tr>
                <th className="text-left p-2">Tầm giá</th>
                <th className="text-right p-2">Số căn</th>
                <th className="text-right p-2 w-64">% trên tổng</th>
                <th className="text-right p-2">Tổng DT (gồm VAT)</th>
              </tr>
            </thead>
            <tbody>
              {priceRows.map((r) => {
                const pct = totalUnits > 0 ? (r.units / totalUnits) * 100 : 0;
                const barPct = maxPriceUnits > 0 ? (r.units / maxPriceUnits) * 100 : 0;
                if (r.units === 0) return null;
                return (
                  <tr key={r.label} className="border-t border-slate-100">
                    <td className="p-2 font-medium">{r.label}</td>
                    <td className="p-2 text-right tabular-nums">{r.units}</td>
                    <td className="p-2">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-3 bg-slate-100 rounded overflow-hidden">
                          <div className="h-full bg-emerald-500" style={{ width: `${barPct}%` }} />
                        </div>
                        <div className="text-right tabular-nums font-medium w-16 text-xs">
                          {fmtPctRaw(pct, 1)}
                        </div>
                      </div>
                    </td>
                    <td className="p-2 text-right tabular-nums text-xs">{fmtMoney(r.revenue)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===== Bedroom × Project ===== */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Số căn theo phòng ngủ × dự án — {filterLabel}</h2>
        <p className="text-xs text-slate-500 mb-3">
          Ma trận chéo: mỗi dự án BRE bán bao nhiêu căn cho từng loại phòng ngủ.
        </p>
        <div className="bg-card rounded-xl ring-1 ring-foreground/10 overflow-x-auto">
          <table className="min-w-full w-max text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600">
              <tr>
                <th className="text-left p-2">Dự án</th>
                {bedroomKeys.map((k) => (
                  <th key={k} className="text-center p-2">
                    {bedroomLabelOf(k)}
                  </th>
                ))}
                <th className="text-right p-2">Tổng</th>
              </tr>
            </thead>
            <tbody>
              {projRows.map((r) => (
                <tr key={r.project} className="border-t border-slate-100">
                  <td className="p-2">
                    <div className="text-xs font-medium">{r.project}</div>
                    <div className="text-xs text-slate-500">{r.partner ?? "—"}</div>
                  </td>
                  {bedroomKeys.map((k) => {
                    const n = r.byBedroom[k] ?? 0;
                    return (
                      <td key={k} className={`p-2 text-center tabular-nums text-xs ${n > 0 ? "font-medium" : "text-slate-300"}`}>
                        {n > 0 ? n : "·"}
                      </td>
                    );
                  })}
                  <td className="p-2 text-right tabular-nums font-semibold">{r.total}</td>
                </tr>
              ))}
              {projRows.length === 0 && (
                <tr>
                  <td colSpan={bedroomKeys.length + 2} className="p-4 text-center text-slate-500">
                    Không có dữ liệu.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===== Diện tích TB per bedroom ===== */}
      {areaByBedroom.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Diện tích trung bình theo loại</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {areaByBedroom.map((a) => (
              <div key={a.label} className="bg-card rounded-lg ring-1 ring-foreground/10 p-3">
                <div className="text-xs text-slate-500">{a.label}</div>
                <div className="text-lg font-bold tabular-nums mt-1">{a.avg.toFixed(1)} m²</div>
                <div className="text-xs text-slate-400">({a.count} căn có nhập diện tích)</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== List căn cần review ===== */}
      {needReview.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-1 text-amber-700">
            ⚠️ Cần check tay ({needReview.length} căn)
          </h2>
          <p className="text-xs text-slate-500 mb-3">
            Căn thiếu số PN, loại căn, hoặc diện tích — báo cáo phân khúc bị lệch nếu chưa bổ sung. Vào form căn để nhập; căn tự biến mất khỏi list sau khi lưu.
          </p>
          <div className="bg-white border border-amber-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-amber-50 text-xs text-slate-600">
                <tr>
                  <th className="text-left p-2">Căn</th>
                  <th className="text-left p-2">Dự án</th>
                  <th className="text-left p-2">Ghi chú</th>
                  <th className="text-right p-2">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {needReview.slice(0, 60).map((p) => {
                  const proj = data.aggregatedProjects.find((ap) => ap.id === p.projectId);
                  return (
                    <tr key={p.id} className="border-t border-slate-100">
                      <td className="p-2 font-mono text-xs">
                        <Link href={`/products/${p.id}`} className="text-blue-600 hover:underline">
                          #{p.id}
                        </Link>
                      </td>
                      <td className="p-2 text-xs text-slate-600">{proj?.name ?? "—"}</td>
                      <td className="p-2 text-xs text-amber-700">{p.reasons.join(" · ")}</td>
                      <td className="p-2 text-right">
                        <Link
                          href={`/products/${p.id}/edit`}
                          className="text-blue-600 hover:underline text-xs"
                        >
                          Sửa
                        </Link>
                      </td>
                    </tr>
                  );
                })}
                {needReview.length > 60 && (
                  <tr>
                    <td colSpan={4} className="p-2 text-center text-xs text-slate-500 italic">
                      ...và {needReview.length - 60} căn khác.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
