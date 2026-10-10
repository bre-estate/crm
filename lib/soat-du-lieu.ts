/**
 * Soát dữ liệu doanh thu và giá vốn, tìm những căn có số không khớp hợp đồng.
 *
 * Mỗi phát hiện kèm đầy đủ phép tính để người đọc tự kiểm, không phải tin
 * vào nhãn. Trước đây những lỗi này chỉ nằm trong các lần rà tay rời rạc,
 * muốn xem lại phải mò từng căn.
 */
import { db } from "@/lib/db";
import { products, projects, revenueReconciliations, costReconciliations } from "@/lib/schema";
import { asc } from "drizzle-orm";
import { computeLuyKe, type CostType } from "@/lib/costCalc";
import { luyKeDoanhThu } from "@/lib/doanh-thu-core";
import type { DongTinh, NhomLoi, PhatHien } from "@/lib/soat-du-lieu-types";

export * from "@/lib/soat-du-lieu-types";

const DUNG_SAI = 0.001;
/** Bỏ qua chênh lệch nhỏ hơn mức này, đó là sai số làm tròn chứ không phải lỗi. */
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

  const ra: PhatHien[] = [];

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
              href: `/revenues/${r.id}/edit`,
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
    const theoLoai = new Map<string, typeof gv>();
    for (const r of gv) {
      if (!theoLoai.has(r.costType)) theoLoai.set(r.costType, []);
      theoLoai.get(r.costType)!.push(r);
    }
    for (const [loai, ds] of theoLoai) {
      const tran = computeLuyKe(cfg, loai as CostType, 1);
      const daGhi = ds.reduce((s, r) => s + Number(r.amountPayableThisTime ?? 0), 0);
      if (!(tran > 0 && daGhi > tran * (1 + DUNG_SAI) && daGhi - tran > NGUONG_BO_QUA)) continue;
      const lech = daGhi - tran;
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
      phep.push({ nhan: "Vượt trần", giaTri: tien(lech), chot: true });

      ra.push({
        ...nen,
        id: `gv-${p.id}-${loai}`,
        nhom: "gia_von_vuot",
        tieuDe: `${TEN_CHI_PHI[loai] ?? loai} vượt trần`,
        lech,
        phepTinh: phep,
        ketLuan:
          `Cộng các đợt đã vượt trần hợp đồng ${tien(lech)}. Tỷ lệ trên từng dòng ` +
          `đúng hay sai xem ở nhóm bên dưới, nếu tỷ lệ đúng thì số tiền của một ` +
          `trong các đợt bị nhập cao hơn tiến độ thực tế.`,
        lienKet: [
          { nhan: "Mở căn", href: `/products/${p.id}` },
          ...ds.map((r) => ({ nhan: `Sửa đợt ${r.reconciliationDate ?? r.id}`, href: `/costs/${r.id}/edit` })),
        ],
      });
    }

    // ── Tỷ lệ ghi trên dòng cao hơn hợp đồng ──
    for (const r of gv) {
      if (LOAI_KHOAN_CO_DINH.has(r.costType)) continue;
      const tl = Number(r.pmgLkSaleRate ?? 0);
      const tran = Number(p.pmgSaleRate ?? 0);
      if (!(tl > 0 && tran > 0 && tl > tran * (1 + DUNG_SAI))) continue;
      ra.push({
        ...nen,
        id: `tl-${r.id}`,
        nhom: "sai_ty_le",
        tieuDe: `${TEN_CHI_PHI[r.costType] ?? r.costType} ghi ${pct(tl)}`,
        lech: 0,
        phepTinh: [
          { nhan: "Tỷ lệ ghi trên dòng", giaTri: pct(tl) },
          { nhan: "Tỷ lệ hợp đồng của căn", giaTri: pct(tran) },
          { nhan: "Ngày đối chiếu", giaTri: String(r.reconciliationDate ?? "") },
          { nhan: "Người nhận", giaTri: String(r.employeeName ?? "") },
          { nhan: "Số tiền đợt này", giaTri: tien(Number(r.amountPayableThisTime ?? 0)), chot: true },
        ],
        ketLuan:
          Math.abs(tl - Number(p.pmgRate ?? 0)) < 1e-9
            ? `Số ${pct(tl)} là tỷ lệ phía doanh thu, không dùng cho giá vốn. Sửa về ${pct(tran)}.`
            : `Sửa tỷ lệ về ${pct(tran)}, hoặc nếu chủ đầu tư thật sự tăng thì sửa %PMG sale ở trang căn trước.`,
        lienKet: [
          { nhan: "Sửa dòng này", href: `/costs/${r.id}/edit` },
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
        lienKet: [{ nhan: "Sửa dòng này", href: `/costs/${r.id}/edit` }],
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
        lienKet: [{ nhan: "Sửa dòng này", href: `/costs/${r.id}/edit` }],
      });
    }
  }

  const thuTu: NhomLoi[] = ["doanh_thu_vuot", "doanh_thu_lech_tien_do", "gia_von_vuot", "sai_ty_le", "tien_do_qua", "thieu_ten", "da_giai_thich"];
  return ra.sort(
    (a, b) => thuTu.indexOf(a.nhom) - thuTu.indexOf(b.nhom) || b.lech - a.lech || a.canMa.localeCompare(b.canMa),
  );
}
