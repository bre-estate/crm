/**
 * Soát dữ liệu doanh thu và giá vốn, tìm những căn có số không khớp hợp đồng.
 *
 * Mỗi phát hiện kèm đầy đủ phép tính để người đọc tự kiểm, không phải tin
 * vào nhãn. Trước đây những lỗi này chỉ nằm trong các lần rà tay rời rạc,
 * muốn xem lại phải mò từng căn.
 */
import { db } from "@/lib/db";
import {
  products,
  projects,
  revenueReconciliations,
  costReconciliations,
  activityLogs,
} from "@/lib/schema";
import { asc, sql } from "drizzle-orm";
import { computeLuyKe, type CostType } from "@/lib/costCalc";
import { luyKeDoanhThu } from "@/lib/doanh-thu-core";
import { getEmployeeOverpaid } from "@/lib/employee-overpaid";
import type { DongTinh, NhomLoi, PhatHien } from "@/lib/soat-du-lieu-types";

export * from "@/lib/soat-du-lieu-types";

const DUNG_SAI = 0.001;
/** Bỏ qua chênh lệch nhỏ hơn mức này, đó là sai số làm tròn chứ không phải lỗi. */
/**
 * Sửa xong một dòng thì quay lại chính trang soát, không bị ném ra danh sách
 * giá vốn của mọi căn. Form đọc tham số returnTo này.
 */
const VE_SOAT = "?returnTo=%2Freports%2Fsoat-du-lieu";

const NGUONG_BO_QUA = 5_000;

/** Loại chi phí ghi số cố định trên căn, công thức không dùng %PMG_LK_sale. */
const LOAI_KHOAN_CO_DINH = new Set([
  "bonus_sale",
  "bonus_manager",
  "cdt_bonus_sale",
  "cdt_bonus_manager",
  "customer_support",
]);

const TEN_CHI_PHI: Record<string, string> = {
  sale_commission: "Hoa hồng sale",
  kpi_ceo: "KPI CEO",
  kpi_tpkd: "KPI TPKD",
  kpi_admin: "KPI Admin",
  bonus_sale: "Công ty thưởng sale",
  bonus_manager: "Công ty thưởng quản lý",
  cdt_bonus_sale: "CĐT thưởng NVKD",
  cdt_bonus_manager: "CĐT thưởng quản lý",
  customer_support: "Hỗ trợ khách",
};


/** Tỷ lệ KPI cấu hình trên căn, theo từng loại chi phí. */
function tyLeKpiCua(
  p: { kpiCeoRate?: number | null; kpiTpkdRate?: number | null; kpiAdminRate?: number | null },
  costType: string,
): number {
  if (costType === "kpi_ceo") return Number(p.kpiCeoRate ?? 0);
  if (costType === "kpi_tpkd") return Number(p.kpiTpkdRate ?? 0);
  if (costType === "kpi_admin") return Number(p.kpiAdminRate ?? 0);
  return 0;
}

const tien = (n: number) => Math.round(n).toLocaleString("vi-VN");
const pct = (v: number) => `${(v * 100).toFixed(2).replace(".", ",")}%`;

export async function soatDuLieu(): Promise<PhatHien[]> {
  const dsCan = await db.select().from(products).orderBy(asc(products.productCode));
  const dsDuAn = await db.select({ id: projects.id, ten: projects.name }).from(projects);
  const tenDuAn = new Map(dsDuAn.map((d) => [d.id, d.ten ?? ""]));
  const dsDT = await db.select().from(revenueReconciliations);
  const dsGV = await db.select().from(costReconciliations);

  const dtTheoCan = new Map<number, typeof dsDT>();
  for (const r of dsDT) {
    if (r.productId == null) continue;
    if (!dtTheoCan.has(r.productId)) dtTheoCan.set(r.productId, []);
    dtTheoCan.get(r.productId)!.push(r);
  }
  const gvTheoCan = new Map<number, typeof dsGV>();
  for (const r of dsGV) {
    if (r.productId == null) continue;
    if (!gvTheoCan.has(r.productId)) gvTheoCan.set(r.productId, []);
    gvTheoCan.get(r.productId)!.push(r);
  }

  // Các lần sửa %PMG sale của từng căn, dùng để biết tỷ lệ đóng băng trên
  // đợt có phải do sửa sau hay không.
  const dsSua = await db
    .select({
      productId: activityLogs.productId,
      luc: activityLogs.createdAt,
    })
    .from(activityLogs)
    .where(sql`${activityLogs.changes}::text LIKE '%pmgSaleRate%'`);
  const suaTheoCan = new Map<number, Date[]>();
  for (const x of dsSua) {
    if (x.productId == null || !x.luc) continue;
    if (!suaTheoCan.has(x.productId)) suaTheoCan.set(x.productId, []);
    suaTheoCan.get(x.productId)!.push(new Date(x.luc));
  }
  /** Căn này có lần sửa %PMG sale nào sau thời điểm tạo đợt không. */
  const daSuaSauKhiTao = (productId: number, taoLuc: Date | null): boolean => {
    if (!taoLuc) return false;
    return (suaTheoCan.get(productId) ?? []).some((d) => d > taoLuc);
  };

  const ra: PhatHien[] = [];
  const theoId = new Map(dsCan.map((c) => [c.id, c]));

  for (const p of dsCan) {
    const nen = {
      canId: p.id,
      canMa: p.productCode ?? String(p.id),
      canTen: p.unitCode ?? "",
      duAn: tenDuAn.get(p.projectId) ?? "",
    };
    const base = Number(p.pmgBasePrice ?? 0);
    const dt = (dtTheoCan.get(p.id) ?? []).sort((a, b) => a.id - b.id);
    const gv = (gvTheoCan.get(p.id) ?? []).sort((a, b) => a.id - b.id);

    // ── Doanh thu: hoa hồng lũy kế không vượt PMG × (%PMG_LK + %phí khác) ──
    const tyLeDT = Number(p.pmgRate ?? 0) + Number(p.otherFeePct ?? 0);
    const tranDT = base * tyLeDT;
    const hhDaGhi = dt.reduce((s, r) => s + Number(r.revenueThisTime ?? 0), 0);
    if (tranDT > 0 && hhDaGhi > tranDT * (1 + DUNG_SAI) && hhDaGhi - tranDT > NGUONG_BO_QUA) {
      const lech = hhDaGhi - tranDT;
      const phep: DongTinh[] = [
        { nhan: "Giá tính PMG", giaTri: tien(base) },
        { nhan: "Tỷ lệ hợp đồng", giaTri: `× ${pct(tyLeDT)}` },
        { nhan: "Trần hoa hồng", giaTri: tien(tranDT), chot: true },
      ];
      for (const r of dt) {
        if (!Number(r.revenueThisTime)) continue;
        const tienDo = Number(r.phasePctThisTime ?? 0);
        phep.push({
          nhan: `Đợt ${r.reconciliationDate ?? ""}${tienDo ? `, tiến độ ${pct(tienDo)}` : ""}`,
          giaTri: tien(Number(r.revenueThisTime)),
        });
      }
      phep.push({ nhan: "Đã ghi", giaTri: tien(hhDaGhi), chot: true });
      phep.push({ nhan: "Vượt trần", giaTri: tien(lech), chot: true });

      // Sale Admin xác nhận 09/10/2026: "do đợt 1 không xuất hóa đơn nên đợt 2
      // dồn toàn bộ VAT của đợt 1 vào đợt 2". Phép thử gồm HAI vế, phải đúng
      // cả hai mới coi là đã giải thích:
      //   1. có đợt chưa xuất hóa đơn
      //   2. phần vượt đúng bằng VAT của riêng các đợt đó
      // Chỉ trùng con số mà đợt nào cũng có hóa đơn thì không phải cơ chế này.
      const dotChuaXuatHD = dt.filter((r) => !r.invoiceId);
      const vatChuaXuat = dotChuaXuatHD.reduce(
        (sum, r) => sum + (Number(r.totalReceivableThisTime ?? 0) * 0.1) / 1.1,
        0,
      );
      const vatDot1 = vatChuaXuat;
      let ketLuan: string;
      const nhanDot = dotChuaXuatHD.map((r) => String(r.reconciliationDate ?? r.id)).join(", ");
      if (dotChuaXuatHD.length > 0) {
        phep.push({
          nhan: `VAT của đợt chưa xuất hóa đơn (${nhanDot}), × 10/110`,
          giaTri: tien(vatChuaXuat),
        });
      }

      // Thuế chỉ dịch tiền GIỮA các đợt, không làm TỔNG to ra. Nên so tổng
      // tiền thật đã vào với tổng theo hợp đồng mới là phép thử đúng. Trước
      // đây app gắn nhãn "đã giải thích" cho căn có phần vượt khớp mức VAT,
      // đó là sai: khớp mức VAT không chứng minh được tổng đúng.
      const tongHopDong = tranDT + Number(p.cdtBonusSale ?? 0) + Number(p.cdtBonusManager ?? 0);
      const tongDaNhan = dt.reduce((sum, r) => sum + Number(r.totalReceivableThisTime ?? 0), 0);
      const duTong = tongDaNhan - tongHopDong;
      phep.push({ nhan: "Tổng theo hợp đồng (hoa hồng + CĐT thưởng)", giaTri: tien(tongHopDong) });
      phep.push({ nhan: "Tổng đã nhận, cộng mọi đợt", giaTri: tien(tongDaNhan) });
      phep.push({ nhan: "Nhận nhiều hơn hợp đồng", giaTri: tien(duTong), chot: true });

      ketLuan =
        `Tổng đã nhận cao hơn tổng theo hợp đồng ${tien(duTong)}. Dù xuất hóa ` +
        `đơn sớm hay muộn thì tổng cuối cùng vẫn phải bằng giá tính PMG nhân ` +
        `%PMG cộng CĐT thưởng, vì thuế chỉ dịch tiền giữa các đợt chứ không ` +
        `làm tổng to ra. Nên cơ chế VAT dồn sang KHÔNG giải thích được khoản ` +
        `này.` +
        (dotChuaXuatHD.length > 0
          ? ` Đợt ${nhanDot} chưa xuất hóa đơn, và mức VAT của đợt đó là ` +
            `${tien(vatChuaXuat)}${Math.abs(duTong - vatChuaXuat) < 2 ? ", trùng đúng khoản dư" : ""}. ` +
            `Có thể đợt đó đang ghi gồm VAT trong khi chủ đầu tư tính chưa gồm VAT.`
          : ` Mọi đợt đều đã xuất hóa đơn nên không có VAT nào để dồn.`) +
        ` Nhờ Sale Admin và kế toán đối chiếu: tổng hợp đồng là số gồm VAT hay ` +
        `chưa gồm VAT, và chủ đầu tư đã trả dư hay chưa.`;

      ra.push({
        ...nen,
        id: `dt-${p.id}`,
        nhom: "doanh_thu_vuot",
        tieuDe: "Doanh thu vượt trần",
        lech,
        phepTinh: phep,
        ketLuan,
        lienKet: [
          { nhan: "Mở căn", href: `/products/${p.id}` },
          { nhan: "Danh sách đợt doanh thu", href: `/revenues?productCode=${encodeURIComponent(nen.canMa)}` },
        ],
      });
    }

    // ── Doanh thu phải khớp tiến độ đã đạt ──
    // Công thức: trần × tiến độ − phí admin. Kiểm trên dữ liệu thật ngày
    // 11/10/2026, khớp 65 trên 71 căn đang dở dang, nên lệch là có chuyện.
    // Phép thử cũ chỉ bắt VƯỢT trần, bỏ lọt mọi trường hợp ghi HỤT.
    // %PMG tăng dần theo mốc sản lượng, nên phải lấy tỷ lệ GHI TRÊN ĐỢT GẦN
    // NHẤT chứ không lấy tỷ lệ cuối của hợp đồng. Dùng tỷ lệ cuối thì mọi căn
    // chưa tới mốc chót đều bị báo thiếu oan: đã báo nhầm B.23.24 và A2-06-17.
    const dotCoDT = dt.filter((r) => Number(r.revenueThisTime ?? 0) !== 0);
    const dotCuoi = dotCoDT[dotCoDT.length - 1];
    const tienDo = Number(dotCuoi?.phasePctThisTime ?? 0);
    const tyLeTaiDot = Number(dotCuoi?.pmgCumulativePct ?? 0) || tyLeDT;
    const phiAdmin = Number(p.adminFee ?? 0);
    if (tranDT > 0 && tienDo > 0) {
      const kyVong = luyKeDoanhThu({
        pmgBasePrice: base,
        pmgCumulativePct: tyLeTaiDot,
        phasePct: tienDo,
        adminFeeVat: dotCuoi?.adminFeeVat,
        adminFee: p.adminFee,
      });
      const lechTD = hhDaGhi - kyVong;
      if (Math.abs(lechTD) > NGUONG_BO_QUA && Math.abs(hhDaGhi - tranDT) > NGUONG_BO_QUA) {
        const phep: DongTinh[] = [
          { nhan: "Giá tính PMG", giaTri: tien(base) },
          {
            nhan: `%PMG ghi trên đợt gần nhất${Math.abs(tyLeTaiDot - tyLeDT) > 1e-9 ? ` (mốc cuối hợp đồng ${pct(tyLeDT)})` : ""}`,
            giaTri: `× ${pct(tyLeTaiDot)}`,
          },
          { nhan: "Tiến độ đã đạt", giaTri: `× ${pct(tienDo)}` },
        ];
        if (phiAdmin) phep.push({ nhan: "Trừ phí admin", giaTri: `− ${tien(phiAdmin)}` });
        phep.push({ nhan: "Đáng ra phải ghi", giaTri: tien(kyVong), chot: true });
        for (const r of dt) {
          if (!Number(r.revenueThisTime)) continue;
          phep.push({
            nhan: `Đợt ${r.reconciliationDate ?? ""}`,
            giaTri: tien(Number(r.revenueThisTime)),
          });
        }
        phep.push({ nhan: "Thực tế đã ghi", giaTri: tien(hhDaGhi), chot: true });
        phep.push({ nhan: lechTD > 0 ? "Ghi DƯ" : "Ghi THIẾU", giaTri: tien(Math.abs(lechTD)), chot: true });

        ra.push({
          ...nen,
          id: `td-dt-${p.id}`,
          nhom: "doanh_thu_lech_tien_do",
          tieuDe: `Tiến độ ${pct(tienDo)} nhưng ghi ${lechTD > 0 ? "dư" : "thiếu"}`,
          lech: Math.abs(lechTD),
          phepTinh: phep,
          ketLuan:
            `Ở tiến độ ${pct(tienDo)} thì doanh thu lũy kế phải là ${tien(kyVong)}, ` +
            `thực tế ghi ${tien(hhDaGhi)}, ${lechTD > 0 ? "dư" : "thiếu"} ${tien(Math.abs(lechTD))}. ` +
            `Công thức trần × tiến độ trừ phí admin đúng với 65 trên 71 căn đang dở dang, ` +
            `nên lệch ở đây là dấu hiệu thật. Hai khả năng: tiến độ ghi sai, hoặc số tiền ` +
            `của một đợt nhập sai. Đối chiếu sao kê để biết tiền thật đã vào bao nhiêu.`,
          lienKet: [
            { nhan: "Mở căn", href: `/products/${p.id}` },
            ...dt.filter((r) => Number(r.revenueThisTime)).map((r) => ({
              nhan: `Sửa đợt ${r.reconciliationDate ?? r.id}`,
              href: `/revenues/${r.id}/edit${VE_SOAT}`,
            })),
          ],
        });
      }
    }

    // ── Giá vốn: lũy kế từng loại không vượt trần ──
    const cfg = {
      pmgBasePrice: base,
      pmgSaleRate: Number(p.pmgSaleRate ?? 0),
      adminFeeSale: Number(p.adminFeeSale ?? 0),
      customerSupport: Number(p.customerSupport ?? 0),
      saleCommissionRate: Number(p.saleCommissionRate ?? 0),
      kpiCeoRate: Number(p.kpiCeoRate ?? 0),
      kpiTpkdRate: Number(p.kpiTpkdRate ?? 0),
      kpiAdminRate: Number(p.kpiAdminRate ?? 0),
      bonusSale: Number(p.bonusSale ?? 0),
      bonusManager: Number(p.bonusManager ?? 0),
      cdtBonusSale: Number(p.cdtBonusSale ?? 0),
      cdtBonusManager: Number(p.cdtBonusManager ?? 0),
    };
    // Tiến độ hiện tại của căn, lấy từ phía doanh thu. computeLuyKe tự biết
    // loại nào nhân tiến độ: hoa hồng sale, KPI CEO, KPI TPKD thì có, KPI
    // Admin và các khoản cố định thì không. Trước đây truyền cứng số 1 nên
    // trần của căn chưa thu đủ bị tính cao hơn thực tế, bỏ lọt chi vượt.
    const tienDoHienTai = dt.reduce(
      (m, r) => Math.max(m, Number(r.phasePctThisTime ?? 0)),
      0,
    ) || 1;

    const theoLoai = new Map<string, typeof gv>();
    for (const r of gv) {
      if (!theoLoai.has(r.costType)) theoLoai.set(r.costType, []);
      theoLoai.get(r.costType)!.push(r);
    }
    for (const [loai, ds] of theoLoai) {
      const tran = computeLuyKe(cfg, loai as CostType, tienDoHienTai);
      const daGhi = ds.reduce((s, r) => s + Number(r.amountPayableThisTime ?? 0), 0);
      if (!(tran > 0 && daGhi > tran * (1 + DUNG_SAI) && daGhi - tran > NGUONG_BO_QUA)) continue;
      const lech = daGhi - tran;

      // Vượt trần theo tiến độ HIỆN TẠI và vượt trần KHI THU ĐỦ là hai chuyện
      // khác hẳn nhau, gộp chung thì không biết khoản nào phải đòi lại.
      //
      //   chi trước tiến độ  còn nằm trong trần lúc khách đóng đủ 100%. Công
      //                      ty ứng trước, tới đợt cuối là khớp. Không mất tiền.
      //   chi dư thật        vượt cả trần khi thu đủ. Đợt nào cũng không bù
      //                      được, phải thu lại.
      //
      // Nguồn của loại thứ nhất: ô "số tiền" trên form KPI gợi ý sẵn phần còn
      // lại của target ĐỦ (computeLuyKe với N = 1, xem targetForType ở
      // app/costs/CostForm.tsx), trong khi trần ở đây tính theo tiến độ thật.
      const tran100 = computeLuyKe(cfg, loai as CostType, 1);
      const duThat = daGhi - tran100 > NGUONG_BO_QUA;
      const lechCuoi = daGhi - tran100;
      const phep: DongTinh[] = [
        { nhan: "Giá tính PMG", giaTri: tien(base) },
        { nhan: "%PMG sale (cơ sở giá vốn)", giaTri: `× ${pct(cfg.pmgSaleRate)}` },
      ];
      if (cfg.adminFeeSale) phep.push({ nhan: "Trừ phí admin", giaTri: `− ${tien(cfg.adminFeeSale)}` });
      phep.push({ nhan: "Chia VAT", giaTri: "÷ 1,1" });
      if (cfg.customerSupport) phep.push({ nhan: "Trừ hỗ trợ khách", giaTri: `− ${tien(cfg.customerSupport)}` });
      phep.push({ nhan: `Trần ${TEN_CHI_PHI[loai] ?? loai}`, giaTri: tien(tran), chot: true });
      for (const r of ds) {
        phep.push({
          nhan: `Đợt ${r.reconciliationDate ?? ""} · ${r.employeeName ?? ""}`,
          giaTri: tien(Number(r.amountPayableThisTime ?? 0)),
        });
      }
      phep.push({ nhan: "Đã ghi", giaTri: tien(daGhi), chot: true });
      phep.push({ nhan: `Vượt trần ở tiến độ ${pct(tienDoHienTai)}`, giaTri: tien(lech), chot: true });
      phep.push({ nhan: "Trần khi khách đóng đủ 100%", giaTri: tien(tran100) });
      phep.push({
        nhan: duThat ? "Vượt cả trần khi thu đủ" : "So trần khi thu đủ thì còn thiếu",
        giaTri: tien(Math.abs(lechCuoi)),
        chot: true,
      });

      ra.push({
        ...nen,
        id: `gv-${p.id}-${loai}`,
        nhom: duThat ? "gia_von_vuot" : "gia_von_chi_truoc",
        tieuDe: duThat
          ? `${TEN_CHI_PHI[loai] ?? loai} chi dư ${tien(lechCuoi)}`
          : `${TEN_CHI_PHI[loai] ?? loai} chi trước tiến độ`,
        lech: duThat ? lechCuoi : lech,
        phepTinh: phep,
        ketLuan: duThat
          ? `Đã chi ${tien(daGhi)}, vượt cả trần khi khách đóng đủ 100% là ` +
            `${tien(tran100)}. Không đợt nào bù được nữa, phải thu lại ` +
            `${tien(lechCuoi)}.`
          : `Đã chi ${tien(daGhi)}, vượt trần ở tiến độ ${pct(tienDoHienTai)} ` +
            `là ${tien(lech)}. Nhưng khi khách đóng đủ 100% thì trần lên ` +
            `${tien(tran100)}, vẫn còn chỗ ${tien(-lechCuoi)}. Đây là công ty ` +
            `ỨNG TRƯỚC chứ không mất tiền, tới đợt cuối là khớp. Muốn thu lại ` +
            `thì là quyết định về dòng tiền, không phải sửa số sai.`,
        lienKet: [
          { nhan: "Mở căn", href: `/products/${p.id}` },
          ...ds.map((r) => ({ nhan: `Sửa đợt ${r.reconciliationDate ?? r.id}`, href: `/costs/${r.id}/edit${VE_SOAT}` })),
        ],
      });
    }

    // ── Tỷ lệ ghi trên dòng cao hơn hợp đồng ──
    // Tỷ lệ trên đợt ĐÓNG BĂNG lúc tạo, nên căn đổi tỷ lệ sau đó là chuyện
    // bình thường, không phải lỗi. Chỉ báo khi KHÔNG có lần sửa tỷ lệ nào
    // sau ngày tạo đợt, tức là lúc nhập đã lấy sai cơ sở.
    for (const r of gv) {
      if (LOAI_KHOAN_CO_DINH.has(r.costType)) continue;
      const tl = Number(r.pmgLkSaleRate ?? 0);
      const tran = Number(p.pmgSaleRate ?? 0);
      if (!(tl > 0 && tran > 0 && tl > tran * (1 + DUNG_SAI))) continue;
      if (daSuaSauKhiTao(p.id, r.createdAt ? new Date(r.createdAt) : null)) continue;
      ra.push({
        ...nen,
        id: `tl-${r.id}`,
        nhom: "sai_ty_le",
        // Nhãn phải nói rõ đây là %PMG sale, không phải tỷ lệ KPI. Nhãn cũ
        // ghi "KPI CEO ghi 5,00%" làm người đọc tưởng tỷ lệ KPI sai, trong
        // khi tỷ lệ KPI đúng, chỉ cơ sở tính bị sai.
        tieuDe: `%PMG sale ghi ${pct(tl)} ở dòng ${TEN_CHI_PHI[r.costType] ?? r.costType}`,
        lech: 0,
        phepTinh: [
          { nhan: "Loại chi phí", giaTri: TEN_CHI_PHI[r.costType] ?? r.costType },
          { nhan: "%PMG sale ghi trên dòng", giaTri: pct(tl) },
          { nhan: "%PMG sale của căn theo hợp đồng", giaTri: pct(tran), chot: true },
          {
            nhan: "Tỷ lệ KPI ghi trên dòng",
            giaTri: `${pct(Number(r.kpiRate ?? 0))}${
              Math.abs(Number(r.kpiRate ?? 0) - tyLeKpiCua(p, r.costType)) < 1e-9 ? " (đúng)" : " (lệch)"
            }`,
          },
          { nhan: "Ngày đối chiếu", giaTri: String(r.reconciliationDate ?? "") },
          { nhan: "Người nhận", giaTri: String(r.employeeName ?? "") },
          { nhan: "Số tiền đợt này", giaTri: tien(Number(r.amountPayableThisTime ?? 0)), chot: true },
        ],
        ketLuan:
          `Tỷ lệ này đóng băng từ lúc tạo đợt, nhưng nhật ký cho thấy KHÔNG ` +
          `ai sửa %PMG sale của căn sau đó, nên đây là lấy sai cơ sở ngay từ ` +
          `lúc nhập chứ không phải hệ quả của việc đổi tỷ lệ. ` +
          `Tỷ lệ KPI trên dòng này đúng, chỉ CƠ SỞ TÍNH sai: dòng lấy %PMG sale ` +
          `${pct(tl)} trong khi hợp đồng của căn là ${pct(tran)}. ` +
          (Math.abs(tl - Number(p.pmgRate ?? 0)) < 1e-9
            ? `Số ${pct(tl)} chính là tỷ lệ phía doanh thu, người nhập lấy nhầm sang giá vốn. `
            : "") +
          `Sửa về ${pct(tran)}, hoặc nếu chủ đầu tư thật sự tăng thì sửa %PMG sale ở trang căn trước.`,
        lienKet: [
          { nhan: "Sửa dòng này", href: `/costs/${r.id}/edit${VE_SOAT}` },
          { nhan: "Mở căn", href: `/products/${p.id}` },
        ],
      });
    }

    // ── Tiến độ thanh toán quá 100% ──
    for (const r of gv) {
      const td = Number(r.paymentProgressPct ?? 0);
      if (td <= 1 + DUNG_SAI) continue;
      ra.push({
        ...nen,
        id: `td-${r.id}`,
        nhom: "tien_do_qua",
        tieuDe: `Tiến độ ghi ${pct(td)}`,
        lech: 0,
        phepTinh: [
          { nhan: "Tiến độ ghi trên dòng", giaTri: pct(td) },
          { nhan: "Tối đa cho phép", giaTri: "100,00%" },
          { nhan: "Số tiền đợt này", giaTri: tien(Number(r.amountPayableThisTime ?? 0)), chot: true },
        ],
        ketLuan: "Tiến độ khách đóng lũy kế không thể quá 100%.",
        lienKet: [{ nhan: "Sửa dòng này", href: `/costs/${r.id}/edit${VE_SOAT}` }],
      });
    }

    // ── Dòng giá vốn chưa có tên người nhận ──
    for (const r of gv) {
      if (r.employeeName && String(r.employeeName).trim()) continue;
      ra.push({
        ...nen,
        id: `tn-${r.id}`,
        nhom: "thieu_ten",
        tieuDe: `${TEN_CHI_PHI[r.costType] ?? r.costType} chưa có tên người`,
        lech: 0,
        phepTinh: [
          { nhan: "Ngày đối chiếu", giaTri: String(r.reconciliationDate ?? "") },
          { nhan: "Số tiền", giaTri: tien(Number(r.amountPayableThisTime ?? 0)), chot: true },
        ],
        ketLuan: "Không có tên thì số tiền này không vào bảng lương của ai.",
        lienKet: [{ nhan: "Sửa dòng này", href: `/costs/${r.id}/edit${VE_SOAT}` }],
      });
    }
  }

  // ── Thưởng nóng: công ty trả NV nhiều hơn số chủ đầu tư cấp về ──
  // Chỉ lấy loại cap_thieu. Loại hoan_lai (CĐT cấp rồi thu lại) là nợ của
  // nhân viên, đã có cảnh báo riêng ở trang căn và trang hoa hồng.
  for (const o of (await getEmployeeOverpaid()).filter((x) => x.loai === "cap_thieu")) {
    if (o.overpaid <= NGUONG_BO_QUA) continue;
    const p = theoId.get(o.productId);
    if (!p) continue;
    const congBo =
      o.costType === "cdt_bonus_sale"
        ? Number(p.cdtBonusSale ?? 0)
        : Number(p.cdtBonusManager ?? 0);
    ra.push({
      canId: p.id,
      canMa: p.productCode ?? String(p.id),
      canTen: p.unitCode ?? "",
      duAn: tenDuAn.get(p.projectId) ?? "",
      id: `tn-dư-${o.productId}-${o.costType}`,
      nhom: "thuong_nong_lech",
      tieuDe: `${TEN_CHI_PHI[o.costType]} trả dư ${tien(o.overpaid)}`,
      lech: o.overpaid,
      phepTinh: [
        { nhan: "Chủ đầu tư công bố trên căn", giaTri: tien(congBo) },
        { nhan: "Công ty đã trả " + o.employeeName, giaTri: tien(o.paid) },
        { nhan: "Chủ đầu tư thật sự cấp về", giaTri: tien(o.revenueTotal) },
        { nhan: "Công ty tự chịu", giaTri: tien(o.overpaid), chot: true },
      ],
      ketLuan:
        `Không có đợt nào ghi số âm, tức chủ đầu tư chưa từng thu lại đồng ` +
        `nào. Chênh lệch sinh ra vì hai bên quy đổi cùng khoản thưởng theo ` +
        `hai cách khác nhau, thường là bóc thuế chia 1,1 so với nhân tỷ lệ ` +
        `F2. ${o.employeeName} KHÔNG nợ công ty và không được khấu trừ vào ` +
        `hoa hồng đợt sau. Việc cần làm là chốt cách quy đổi thưởng nóng ` +
        `ngay trong hợp đồng lần sau, còn ${tien(o.overpaid)} này ghi nhận ` +
        `là chi phí của công ty.`,
      lienKet: [
        { nhan: "Mở căn", href: `/products/${p.id}?section=cost` },
        { nhan: "Xem doanh thu", href: `/products/${p.id}?section=revenue` },
      ],
    });
  }

  const thuTu: NhomLoi[] = ["doanh_thu_vuot", "doanh_thu_lech_tien_do", "gia_von_vuot", "gia_von_chi_truoc", "thuong_nong_lech", "sai_ty_le", "tien_do_qua", "thieu_ten", "da_giai_thich"];
  return ra.sort(
    (a, b) => thuTu.indexOf(a.nhom) - thuTu.indexOf(b.nhom) || b.lech - a.lech || a.canMa.localeCompare(b.canMa),
  );
}
