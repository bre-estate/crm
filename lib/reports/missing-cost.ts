/**
 * So giá vốn giữa file Báo cáo Doanh Thu của kế toán và cost_reconciliations trong app.
 *
 * Nguồn Excel lấy theo thứ tự ưu tiên:
 *   1. File mới nhất trong Kho tài liệu, loại "Báo cáo Doanh Thu (kế toán)"
 *   2. Bản chụp lưu trong code (lib/reports/cost-audit-snapshot.json), dùng khi chưa ai tải file lên
 *
 * Trước đây chỉ có cách 2, nên file kế toán đổi mà quên chạy lại lệnh chụp là trang
 * so với số cũ. Chuyện đó đã xảy ra: bản chụp 27/08 làm trang báo chênh 289,6 triệu
 * trong khi thực tế chỉ chênh 46,5 triệu.
 */
import * as XLSX from "xlsx";
import { db } from "@/lib/db";
import { sql, desc, eq, and } from "drizzle-orm";
import { documents } from "@/lib/schema";
import { createClient } from "@/lib/supabase/server";
import snapshot from "./cost-audit-snapshot.json";
import { bocGiaVon, COST_TYPE_LABEL, SHEET_GIA_VON, type BangGiaVon } from "./bcdt-gia-von";

export type MissingItem = {
  loai: string;
  amt: number;
  employee: string | null;
  excelRow: number;
};

export type MissingCostRow = {
  productCode: string;
  productId: number | null;
  excelCount: number;
  dbCount: number;
  excelTotal: number;
  dbTotal: number;
  diff: number;
  missingItems: MissingItem[];
  actors: string[];
};

/** Đợt kế toán tính trước nhưng chưa lập biên bản đối chiếu, app chưa có là đúng. */
export type DotDuTinh = {
  productCode: string;
  excelRow: number;
  employee: string | null;
  total: number;
  items: { loai: string; amt: number }[];
};



function excelLoaiToCostType(loai: string): string | undefined {
  return Object.entries(COST_TYPE_LABEL).find(([, v]) => v === loai)?.[0];
}

/**
 * So giá vốn giữa Excel và app.
 *
 * Chỉ so những đợt ĐÃ CÓ NGÀY ĐỐI CHIẾU. Dòng trong Excel để trống cột ngày là
 * kế toán mới tính trước, chưa lập biên bản, nên app chưa có là đúng chứ không
 * phải thiếu. Trước đây gộp chung nên trang báo chênh 289,6 triệu toàn đợt chưa
 * phát sinh, làm tưởng HR quên nhập.
 */
/**
 * Lấy bảng giá vốn của kế toán.
 * Ưu tiên file mới nhất trong Kho tài liệu loại "Báo cáo Doanh Thu (kế toán)".
 * Chưa ai tải lên thì dùng bản chụp cũ trong code, và nói rõ là đang dùng bản nào.
 */
async function layBangGiaVon(): Promise<{ bang: BangGiaVon; nguon: string; moc: string }> {
  try {
    const [doc] = await db
      .select()
      .from(documents)
      .where(and(eq(documents.docType, "bao_cao_ke_toan")))
      .orderBy(desc(documents.createdAt))
      .limit(1);
    if (doc) {
      const supabase = await createClient();
      const { data, error } = await supabase.storage.from("tai-lieu").download(doc.storagePath);
      if (!error && data) {
        const wb = XLSX.read(Buffer.from(await data.arrayBuffer()), { cellDates: false });
        const ws = wb.Sheets[SHEET_GIA_VON];
        if (ws) {
          const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: false });
          return {
            bang: bocGiaVon(grid),
            nguon: doc.title,
            moc: doc.createdAt.toISOString(),
          };
        }
      }
    }
  } catch {
    // Đọc file hỏng thì rơi về bản chụp, đừng làm sập cả trang.
  }
  const s = snapshot as unknown as BangGiaVon & { snapshotAt: string };
  return { bang: s, nguon: "bản chụp lưu trong code", moc: s.snapshotAt };
}

export async function getMissingCostReport(): Promise<{
  rows: MissingCostRow[];
  duTinh: DotDuTinh[];
  excelTotal: number;
  dbTotal: number;
  totalDiff: number;
  snapshotAt: string;
  nguon: string;
}> {
  const { bang: snap, nguon, moc } = await layBangGiaVon();

  const dbRows = (await db.execute(sql`
    SELECT p.id AS product_id, p.product_code, cr.id, cr.cost_type,
      cr.employee_name, cr.reconciliation_date, cr.amount_payable_this_time,
      (SELECT actor_email FROM activity_logs
        WHERE entity_type='cost_reconciliation' AND entity_id=cr.id AND action='create'
        ORDER BY created_at LIMIT 1) AS actor
    FROM cost_reconciliations cr
    JOIN products p ON p.id = cr.product_id
  `)) as unknown as Array<{
    product_id: number;
    product_code: string;
    id: number;
    cost_type: string;
    employee_name: string;
    reconciliation_date: string | null;
    amount_payable_this_time: number;
    actor: string | null;
  }>;

  const dbPerProduct = new Map<string, typeof dbRows>();
  for (const r of dbRows) {
    const cur = dbPerProduct.get(r.product_code) || [];
    cur.push(r);
    dbPerProduct.set(r.product_code, cur);
  }

  const report: MissingCostRow[] = [];
  const duTinh: DotDuTinh[] = [];
  let excelTotal = 0;
  let dbTotal = 0;

  for (const [code, tatCaDot] of Object.entries(snap.perProduct)) {
    // Tách đợt chưa có ngày đối chiếu ra khỏi phép so.
    const excelRows = tatCaDot.filter((e) => e.coNgayDoiChieu !== false);
    for (const e of tatCaDot.filter((e) => e.coNgayDoiChieu === false))
      duTinh.push({ productCode: code, excelRow: e.excelRow, employee: e.employee, total: e.total, items: e.items });
    const dbList = dbPerProduct.get(code) || [];
    const dbUsed = new Set<number>();
    const missingItems: MissingItem[] = [];

    for (const eRow of excelRows) {
      for (const item of eRow.items) {
        const costType = excelLoaiToCostType(item.loai);
        const match = dbList.find(
          (d) =>
            !dbUsed.has(d.id) &&
            d.cost_type === costType &&
            Math.abs(Number(d.amount_payable_this_time) - item.amt) < 1000,
        );
        if (match) dbUsed.add(match.id);
        else
          missingItems.push({
            loai: item.loai,
            amt: item.amt,
            employee: eRow.employee,
            excelRow: eRow.excelRow,
          });
      }
    }

    const excelSum = excelRows.reduce((s, r) => s + r.total, 0);
    const dbSum = dbList.reduce((s, r) => s + Number(r.amount_payable_this_time), 0);
    excelTotal += excelSum;
    dbTotal += dbSum;
    const diff = excelSum - dbSum;
    if (Math.abs(diff) < 1000) continue;

    const actors = [...new Set(dbList.map((d) => d.actor).filter(Boolean) as string[])];
    report.push({
      productCode: code,
      productId: dbList[0]?.product_id ?? null,
      excelCount: excelRows.length,
      dbCount: dbList.length,
      excelTotal: excelSum,
      dbTotal: dbSum,
      diff,
      missingItems,
      actors,
    });
  }
  report.sort((a, b) => b.diff - a.diff);

  duTinh.sort((a, b) => b.total - a.total);

  return {
    rows: report,
    duTinh,
    excelTotal,
    dbTotal,
    totalDiff: excelTotal - dbTotal,
    snapshotAt: moc,
    nguon,
  };
}
