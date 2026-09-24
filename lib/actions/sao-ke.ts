"use server";

import * as XLSX from "xlsx";
import { parse as parseCsv } from "csv-parse/sync";
import { requirePermission, getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { bankTransactions, documents } from "@/lib/schema";
import { desc, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { chayCoKetQua } from "@/lib/actions/ket-qua";
import {
  bocDongTuLuoi,
  khoaDong,
  soatFile,
  type DongSaoKe,
  type KetQuaDoc,
  type KetQuaSoat,
} from "@/lib/sao-ke-core";

const BUCKET = "tai-lieu";

/** Tải file từ kho rồi bóc thành các dòng giao dịch. */
async function docTuKho(storagePath: string): Promise<KetQuaDoc> {
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
  if (error || !data) throw new Error("Không đọc được file trong kho. Thử tải lại file.");
  const buf = Buffer.from(await data.arrayBuffer());

  let grid: unknown[][];
  if (/\.csv$/i.test(storagePath)) {
    let raw = buf.toString("utf-8");
    if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
    grid = parseCsv(raw, {
      skip_empty_lines: false,
      relax_column_count: true,
      relax_quotes: true,
    }) as unknown[][];
  } else {
    const wb = XLSX.read(buf, { cellDates: false });
    grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], {
      header: 1,
      defval: null,
      raw: false,
    });
  }

  const doc = bocDongTuLuoi(grid);
  if (!doc) {
    throw new Error(
      "File này không giống sao kê Techcombank. Cần bản ngân hàng xuất ra, có dòng tiêu đề bắt đầu bằng \"Ngày KH yêu cầu\".",
    );
  }
  if (doc.rows.length === 0) throw new Error("File đọc được nhưng không có dòng giao dịch nào.");
  return doc;
}

/** Trạng thái hiện tại của phần sao kê đã có trong app, để biết file mới nối tiếp được không. */
async function trangThaiDaCo() {
  const [cuoi] = await db
    .select({
      ngay: bankTransactions.transactionDate,
      soDu: bankTransactions.runningBalance,
    })
    .from(bankTransactions)
    .orderBy(desc(bankTransactions.statementSeq))
    .limit(1);

  const khoa = await db
    .select({
      ref: bankTransactions.referenceNumber,
      no: bankTransactions.debitAmount,
      co: bankTransactions.creditAmount,
    })
    .from(bankTransactions);

  const tap = new Set(
    khoa.map((k) =>
      khoaDong({ referenceNumber: k.ref, debitAmount: k.no, creditAmount: k.co }),
    ),
  );
  return { tap, soDuCuoi: cuoi?.soDu ?? null, ngayCuoi: cuoi?.ngay ?? null };
}

async function _soatSaoKe(storagePath: string): Promise<KetQuaSoat> {
  await requirePermission("finance", "edit");
  const doc = await docTuKho(storagePath);
  const { tap, soDuCuoi, ngayCuoi } = await trangThaiDaCo();
  return soatFile(doc, tap, soDuCuoi, ngayCuoi);
}

export interface KetQuaNap {
  daGhi: number;
  boQua: number;
  tuNgay: string | null;
  denNgay: string | null;
}

/**
 * Nạp các dòng của file vào bank_transactions.
 *
 * Đọc lại file từ kho chứ không nhận dữ liệu từ trình duyệt gửi lên, để người dùng
 * không sửa được số trước khi ghi. Dòng đã có thì bỏ qua theo khóa (số bút toán, nợ, có).
 */
async function _napSaoKe(storagePath: string): Promise<KetQuaNap> {
  await requirePermission("finance", "edit");
  const user = await getCurrentUser();
  if (!user) throw new Error("Phiên đăng nhập đã hết hạn, tải lại trang rồi đăng nhập lại.");

  const doc = await docTuKho(storagePath);
  const { tap, soDuCuoi, ngayCuoi } = await trangThaiDaCo();
  // Lấy thứ tự đã xếp lại theo chuỗi số dư, không dùng thứ tự thô của file.
  const daXep = soatFile(doc, tap, soDuCuoi, ngayCuoi).rows;

  // statement_seq tạm, chuẩn hóa lại theo ngày ở cuối. Lấy mốc sau số lớn nhất đang có.
  const [{ toiDa }] = await db
    .select({ toiDa: sql<number>`COALESCE(MAX(statement_seq), 0)::int` })
    .from(bankTransactions);

  const moi: DongSaoKe[] = daXep.filter((r) => !tap.has(khoaDong(r)));
  let daGhi = 0;

  for (let i = 0; i < moi.length; i += 200) {
    const lo = moi.slice(i, i + 200);
    await db
      .insert(bankTransactions)
      .values(
        lo.map((r, j) => ({
          accountNumber: doc.accountNumber,
          requestDate: new Date(r.requestDate),
          transactionDate: r.transactionDate,
          referenceNumber: r.referenceNumber,
          statementSeq: toiDa + i + j + 1,
          partnerBank: r.partnerBank,
          partnerAccount: r.partnerAccount,
          partnerName: r.partnerName,
          description: r.description,
          debitAmount: r.debitAmount,
          creditAmount: r.creditAmount,
          feeInterest: r.feeInterest,
          vat: r.vat,
          runningBalance: r.runningBalance,
          sourceFile: storagePath,
        })),
      )
      .onConflictDoNothing();
    daGhi += lo.length;
  }

  // Chuẩn hóa lại thứ tự theo ngày, giữ nguyên thứ tự trong cùng ngày.
  // Báo cáo lấy số dư đầu và cuối kỳ theo cột này nên phải liền mạch.
  await db.execute(sql`
    WITH thu_tu AS (
      SELECT id, row_number() OVER (ORDER BY transaction_date, statement_seq NULLS LAST, id) AS n
      FROM bank_transactions
    )
    UPDATE bank_transactions b SET statement_seq = t.n
    FROM thu_tu t WHERE b.id = t.id AND b.statement_seq IS DISTINCT FROM t.n`);

  // Gắn file vào kho tài liệu nếu chưa có, để sau còn truy nguồn.
  await db
    .update(documents)
    .set({ note: sql`COALESCE(note, '') || ' · đã nạp ' || ${String(daGhi)} || ' dòng'` })
    .where(sql`storage_path = ${storagePath} AND COALESCE(note, '') NOT LIKE '%đã nạp%'`);

  revalidatePath("/finance/bank-review");
  revalidatePath("/documents");

  return {
    daGhi,
    boQua: daXep.length - moi.length,
    tuNgay: daXep[0]?.transactionDate ?? null,
    denNgay: daXep[daXep.length - 1]?.transactionDate ?? null,
  };
}

export async function soatSaoKe(storagePath: string) {
  return chayCoKetQua(() => _soatSaoKe(storagePath));
}

export async function napSaoKe(storagePath: string) {
  return chayCoKetQua(() => _napSaoKe(storagePath));
}
