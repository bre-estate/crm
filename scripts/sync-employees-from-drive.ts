/**
 * Đồng bộ bảng employees từ Drive "3-Nhân Sự - BRE/Danh Sách Nhân Viên.xlsx".
 * Mặc định chạy thử (in ra thay đổi). Thêm --apply để ghi.
 *
 *   npx tsx scripts/sync-employees-from-drive.ts            # xem trước
 *   npx tsx scripts/sync-employees-from-drive.ts --apply    # ghi + backup employees vào backups/
 *
 * Quy tắc:
 * - Khớp theo tên đã bỏ dấu, bỏ chữ "Thị" (Excel ghi "Trần Thị Thanh Thuý", CRM "Trần Thanh Thúy").
 * - Cập nhật: position, active (theo Tình trạng), email, phone, code, contract_type, start_date, end_date.
 * - KHÔNG đụng alias_of_id, department_id của người đã có. Người mới: admin/hr/accountant → Hành chính,
 *   content_writer/video_editor/cameraman → Marketing, sale → không gán phòng.
 * - Ngoại lệ giữ nguyên active=false: 3 CTV đã gộp về Trần Bình Trọng (quyết định operator 11/09/2026).
 * - Người có trong CRM nhưng không có trong Excel: chỉ liệt kê, không xóa, không đổi.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import * as XLSX from "xlsx";
import fs from "fs";
import path from "path";

const XLSX_PATH = process.env.XLSX_PATH ?? path.resolve(process.env.HOME ?? "", "Documents/Company/BRE/App/Drive/3-Nhân Sự - BRE/Danh Sách Nhân Viên.xlsx");
const APPLY = process.argv.includes("--apply");

const POSITION_MAP: Record<string, string> = {
  "tổng giám đốc": "ceo", "giám đốc": "ceo",
  "trưởng phòng kd": "tpkd", "trưởng phòng kinh doanh": "tpkd",
  "nhân viên kinh doanh": "nvkd",
  "admin": "admin", "sale admin": "admin",
  "hành chính nhân sự": "hr",
  "kế toán dịch vụ": "accountant", "kế toán": "accountant",
  "editor": "video_editor", "video editor": "video_editor",
  "cameraman": "cameraman",
  "content writer": "content_writer",
};
const KEEP_INACTIVE = ["Đinh Viết Hân", "Châu Thị Kim Ngân", "Bùi Thị Kiều Chi"]; // gộp về Trần Bình Trọng
const DEPT_BY_POSITION: Record<string, number | null> = { admin: 19, hr: 19, accountant: 19, content_writer: 20, video_editor: 20, cameraman: 20 };

const strip = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toUpperCase().replace(/\s+/g, " ").trim();
const nameKey = (s: string) => strip(s).replace(/\bTHI\b/g, "").replace(/\s+/g, " ").trim();

const pad = (n: number) => String(n).padStart(2, "0");
/** Ô ngày trong Excel bị gõ lẫn dd/mm và mm/dd. Nếu tháng không khớp tháng lương đầu/cuối mà đảo ngày-tháng thì khớp, thì đảo. */
function fixSwap(ymd: string | null, monthHint: string | null): string | null {
  if (!ymd || !monthHint) return ymd;
  const m = monthHint.match(/^(\d{1,2})\/(\d{4})$/); if (!m) return ymd;
  const hint = `${m[2]}-${m[1].padStart(2, "0")}`;
  if (ymd.startsWith(hint)) return ymd;
  const [y, mo, d] = ymd.split("-");
  if (Number(d) <= 12 && `${y}-${d}` === hint) return `${y}-${d}-${mo}`;
  return ymd;
}
function toYmd(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") { const d = XLSX.SSF.parse_date_code(v); return d ? `${d.y}-${pad(d.m)}-${pad(d.d)}` : null; }
  if (v instanceof Date) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})\/(\d{4})$/); if (m) return `${m[2]}-${m[1].padStart(2, "0")}-01`;
  return null; // "không khớp bhxh" và các ghi chú khác
}

type XRow = { name: string; code: string | null; position: string; positionRaw: string; active: boolean; email: string | null; phone: string | null; contractType: string | null; startDate: string | null; endDate: string | null; salaryFirst: string | null };

function readExcel(): XRow[] {
  const wb = XLSX.read(fs.readFileSync(XLSX_PATH));
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });
  const out: XRow[] = [];
  for (const r of rows) {
    const name = String(r["Họ Tên"] ?? "").trim();
    if (!name) continue;
    const positionRaw = String(r["Chức Vụ"] ?? "").trim();
    const code = r["Mã NV"] == null ? null : String(r["Mã NV"]).trim();
    let position = POSITION_MAP[positionRaw.toLowerCase()];
    if (!position) throw new Error(`Chức vụ chưa map: "${positionRaw}" (${name})`);
    if (code?.startsWith("CTV-")) position = "ctv"; // CTV đối tác 65%, khác NVKD hợp đồng CTV
    const status = String(r["Tình trạng"] ?? "").toLowerCase();
    const emailRaw = r["Email"] == null ? null : String(r["Email"]).trim();
    out.push({
      name, positionRaw, position,
      code,
      active: status.includes("đang"),
      email: emailRaw || null,
      phone: r["Điện Thoại"] == null ? null : String(r["Điện Thoại"]).replace(/\.0$/, "").trim() || null,
      contractType: r["Loại hợp đồng"] == null ? null : String(r["Loại hợp đồng"]).trim(),
      startDate: fixSwap(toYmd(r["Ngày bắt đầu làm việc"]), r["Tháng đầu có lương"] == null ? null : String(r["Tháng đầu có lương"])),
      endDate: fixSwap(toYmd(r["Thời điểm chấm dứt HĐ"]), r["Tháng cuối có lương"] == null ? null : String(r["Tháng cuối có lương"])),
      salaryFirst: r["Tháng đầu có lương"] == null ? null : String(r["Tháng đầu có lương"]),
    });
  }
  const emailCount = new Map<string, number>();
  for (const x of out) if (x.email) emailCount.set(x.email.toLowerCase(), (emailCount.get(x.email.toLowerCase()) ?? 0) + 1);
  for (const x of out) if (x.email && (emailCount.get(x.email.toLowerCase()) ?? 0) > 1) { console.log(`⚠ email trùng 2 người trong Excel, bỏ qua: ${x.name} ${x.email}`); x.email = null; }
  return out;
}

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);
  const xrows = readExcel();
  const emps = await sql<{ id: number; name: string; position: string; active: boolean; email: string | null; phone: string | null; code: string | null; contract_type: string | null; start_date: string | null; end_date: string | null; department_id: number | null; alias_of_id: number | null; note: string | null }[]>`SELECT * FROM employees ORDER BY id`;
  const byKey = new Map(emps.map((e) => [nameKey(e.name), e]));

  const updates: { id: number; name: string; changes: Record<string, [unknown, unknown]> }[] = [];
  const inserts: XRow[] = [];
  const seen = new Set<number>();
  for (const x of xrows) {
    const e = byKey.get(nameKey(x.name));
    if (!e) { inserts.push(x); continue; }
    seen.add(e.id);
    const active = KEEP_INACTIVE.includes(e.name) ? false : x.active;
    const want: Record<string, unknown> = { position: x.position, active, email: x.email ?? e.email, phone: x.phone ?? e.phone, code: x.code, contract_type: x.contractType, start_date: x.startDate, end_date: x.endDate };
    const cur: Record<string, unknown> = { position: e.position, active: e.active, email: e.email, phone: e.phone, code: e.code, contract_type: e.contract_type, start_date: e.start_date, end_date: e.end_date };
    const changes: Record<string, [unknown, unknown]> = {};
    for (const k of Object.keys(want)) if ((want[k] ?? null) !== (cur[k] ?? null)) changes[k] = [cur[k] ?? null, want[k] ?? null];
    if (Object.keys(changes).length) updates.push({ id: e.id, name: e.name, changes });
  }
  const onlyCrm = emps.filter((e) => !seen.has(e.id));

  console.log(`Excel ${xrows.length} người · CRM ${emps.length} · cập nhật ${updates.length} · thêm mới ${inserts.length} · chỉ có trong CRM ${onlyCrm.length}\n`);
  console.log("== CẬP NHẬT ==");
  for (const u of updates) console.log(`#${u.id} ${u.name}: ` + Object.entries(u.changes).map(([k, [a, b]]) => `${k} ${a ?? "∅"} → ${b ?? "∅"}`).join(" | "));
  console.log("\n== THÊM MỚI ==");
  for (const x of inserts) console.log(`${x.code} ${x.name} · ${x.position} · ${x.active ? "đang làm" : "đã nghỉ"} · HĐ ${x.contractType ?? "∅"} · ${x.startDate ?? "∅"} → ${x.endDate ?? "∅"}`);
  console.log("\n== CHỈ CÓ TRONG CRM (giữ nguyên) ==");
  for (const e of onlyCrm) console.log(`#${e.id} ${e.name} · ${e.position} · ${e.active ? "active" : "inactive"} · ${e.note ?? ""}`);

  if (!APPLY) { console.log("\n(chạy thử, chưa ghi. Thêm --apply để ghi)"); await sql.end(); return; }

  fs.mkdirSync("backups", { recursive: true });
  const bk = `backups/employees-${new Date().toISOString().slice(0, 10)}-pre-sync.json`;
  fs.writeFileSync(bk, JSON.stringify(emps, null, 1));
  console.log("\nBackup:", bk);

  await sql.unsafe(fs.readFileSync("drizzle/0042_employees_hr_fields.sql", "utf8"));
  for (const u of updates) {
    const set: Record<string, unknown> = {};
    for (const [k, [, b]] of Object.entries(u.changes)) set[k] = b;
    await sql`UPDATE employees SET ${sql(set)} WHERE id = ${u.id}`;
  }
  for (const x of inserts) {
    await sql`INSERT INTO employees ${sql({
      name: x.name, position: x.position, active: KEEP_INACTIVE.includes(x.name) ? false : x.active, email: x.email, phone: x.phone,
      code: x.code, contract_type: x.contractType, start_date: x.startDate, end_date: x.endDate,
      department_id: DEPT_BY_POSITION[x.position] ?? null, note: "Thêm từ Danh Sách Nhân Viên (Drive) 12/09/2026",
    })}`;
  }
  console.log(`Đã ghi: ${updates.length} cập nhật, ${inserts.length} thêm mới.`);
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
