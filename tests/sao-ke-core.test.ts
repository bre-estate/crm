import { describe, test, expect } from "vitest";
import {
  bocDongTuLuoi,
  khoaDong,
  parseNum,
  sapLaiTheoChuoi,
  soatChuoiSoDu,
  soatFile,
  type DongSaoKe,
} from "@/lib/sao-ke-core";

/** Dựng một dòng sao kê tối giản. Cột Nợ để số âm, đúng như Techcombank xuất. */
function dong(p: Partial<DongSaoKe> & { transactionDate: string; runningBalance: number }): DongSaoKe {
  return {
    requestDate: p.transactionDate,
    referenceNumber: p.referenceNumber ?? "REF",
    partnerBank: null,
    partnerAccount: null,
    partnerName: null,
    description: p.description ?? "",
    debitAmount: p.debitAmount ?? null,
    creditAmount: p.creditAmount ?? null,
    feeInterest: p.feeInterest ?? null,
    vat: p.vat ?? null,
    ...p,
  };
}

describe("parseNum", () => {
  test("bỏ dấu phẩy ngăn nghìn", () => expect(parseNum("30,000,000")).toBe(30_000_000));
  test("giữ số âm của cột Nợ", () => expect(parseNum("-5,000,000")).toBe(-5_000_000));
  test("ô trống thành null", () => expect(parseNum("  ")).toBeNull());
  test("chữ không phải số thành null", () => expect(parseNum("abc")).toBeNull());
});

describe("khoaDong", () => {
  // Techcombank dùng lại số bút toán cho lệnh hoàn nên khóa phải kèm số tiền.
  test("cùng số bút toán, khác số tiền thì khác khóa", () => {
    const a = khoaDong({ referenceNumber: "X1", debitAmount: -100, creditAmount: null });
    const b = khoaDong({ referenceNumber: "X1", debitAmount: null, creditAmount: 100 });
    expect(a).not.toBe(b);
  });
});

describe("bocDongTuLuoi", () => {
  const luoi = [
    ["Account number", "19001234567"],
    ["Ngày KH yêu cầu", "Ngày GD", "Số bút toán", "NH đối tác", "TK đối tác", "Tên đối tác", "Diễn giải", "Nợ", "Có", "Phí", "Thuế", "Số dư"],
    ["2026-01-10", "2026-01-10", "R2", "", "", "", "Chi luong", "-5,000,000", "", "", "", "25,000,000"],
    ["2026-01-05", "2026-01-05", "R1", "", "", "", "Thu phi moi gioi", "", "30,000,000", "", "", "30,000,000"],
  ];

  test("đảo lại thành cũ trước, vì file xếp mới nhất trước", () => {
    const kq = bocDongTuLuoi(luoi)!;
    expect(kq.rows.map((r) => r.referenceNumber)).toEqual(["R1", "R2"]);
  });

  test("đọc được số tài khoản", () => {
    expect(bocDongTuLuoi(luoi)!.accountNumber).toBe("19001234567");
  });

  test("không phải sao kê Techcombank thì trả null", () => {
    expect(bocDongTuLuoi([["Tên", "Số tiền"], ["A", "1"]])).toBeNull();
  });
});

describe("soatChuoiSoDu", () => {
  // Công thức: số dư = số dư trước + nợ + có + phí + thuế. Cột Nợ vốn đã âm.
  test("chuỗi liền mạch thì không có chỗ đứt", () => {
    const rows = [
      dong({ transactionDate: "2026-01-05", creditAmount: 30_000_000, runningBalance: 30_000_000 }),
      dong({ transactionDate: "2026-01-10", debitAmount: -5_000_000, runningBalance: 25_000_000 }),
      dong({ transactionDate: "2026-01-12", feeInterest: -40_000, runningBalance: 24_960_000 }),
    ];
    const kq = soatChuoiSoDu(rows);
    expect(kq.soMoiNoi).toBe(2);
    expect(kq.choDut).toHaveLength(0);
  });

  test("thiếu một dòng thì chuỗi đứt và KHÔNG bù về 0", () => {
    const rows = [
      dong({ transactionDate: "2026-01-05", creditAmount: 30_000_000, runningBalance: 30_000_000 }),
      // dòng chi 7tr bị thiếu ở đây
      dong({ transactionDate: "2026-01-20", debitAmount: -1_000_000, runningBalance: 22_000_000 }),
    ];
    const kq = soatChuoiSoDu(rows);
    expect(kq.choDut).toHaveLength(1);
    expect(kq.chiSaiThuTu).toBe(false);
    expect(kq.tongLech).toBe(-7_000_000);
  });

  // Số thật lấy từ sao kê, dòng 486 đến 488 ngày 09/02/2026. Thứ tự đúng phải là
  // -9.000.000 rồi -33.672.759, file lại xếp ngược. Ba chỗ lệch cộng lại đúng bằng 0.
  test("cùng ngày sai thứ tự, cộng lại bằng 0 thì không phải mất dòng", () => {
    const rows = [
      dong({ transactionDate: "2026-02-06", debitAmount: -13_000_000, runningBalance: 1_343_820_742 }),
      dong({ transactionDate: "2026-02-09", debitAmount: -33_672_759, runningBalance: 1_301_147_983 }),
      dong({ transactionDate: "2026-02-09", debitAmount: -9_000_000, runningBalance: 1_334_820_742 }),
      dong({ transactionDate: "2026-02-09", debitAmount: -25_318_926, runningBalance: 1_275_829_057 }),
    ];
    const kq = soatChuoiSoDu(rows);
    expect(kq.choDut.map((c) => c.lech)).toEqual([-9_000_000, 42_672_759, -33_672_759]);
    expect(kq.chiSaiThuTu).toBe(true);
    expect(kq.tongLech).toBe(0);
  });

  test("nối tiếp được số dư cuối của phần đã có trong app", () => {
    const rows = [dong({ transactionDate: "2026-03-01", creditAmount: 1_000_000, runningBalance: 6_000_000 })];
    expect(soatChuoiSoDu(rows, 5_000_000).choDut).toHaveLength(0);
    expect(soatChuoiSoDu(rows, 4_000_000).choDut).toHaveLength(1);
  });
});

describe("sapLaiTheoChuoi", () => {
  // Số thật: sao kê Q3-2026 có ba lệnh lương cùng ngày 05/08/2026, Techcombank xuất
  // theo thứ tự khác với thứ tự nó ghi sổ nên đọc tuần tự là số dư nhảy cóc.
  const cum = [
    dong({ transactionDate: "2026-02-06", debitAmount: -13_000_000, runningBalance: 1_343_820_742 }),
    dong({ transactionDate: "2026-02-09", debitAmount: -33_672_759, runningBalance: 1_301_147_983 }),
    dong({ transactionDate: "2026-02-09", debitAmount: -9_000_000, runningBalance: 1_334_820_742 }),
    dong({ transactionDate: "2026-02-09", debitAmount: -25_318_926, runningBalance: 1_275_829_057 }),
  ];

  test("xếp lại xong thì chuỗi số dư liền mạch", () => {
    const kq = soatChuoiSoDu(sapLaiTheoChuoi(cum));
    expect(kq.choDut).toHaveLength(0);
  });

  test("đúng thứ tự ngân hàng ghi sổ, không thêm bớt dòng nào", () => {
    const xep = sapLaiTheoChuoi(cum);
    expect(xep.map((r) => r.runningBalance)).toEqual([
      1_343_820_742, 1_334_820_742, 1_301_147_983, 1_275_829_057,
    ]);
    expect(xep).toHaveLength(cum.length);
  });

  test("không hoán vị sang ngày khác", () => {
    const rows = [
      dong({ transactionDate: "2026-01-05", creditAmount: 10_000_000, runningBalance: 10_000_000 }),
      dong({ transactionDate: "2026-01-06", debitAmount: -1_000_000, runningBalance: 9_000_000 }),
      dong({ transactionDate: "2026-01-07", debitAmount: -2_000_000, runningBalance: 7_000_000 }),
    ];
    expect(sapLaiTheoChuoi(rows).map((r) => r.transactionDate)).toEqual([
      "2026-01-05", "2026-01-06", "2026-01-07",
    ]);
  });

  test("thiếu dòng thật thì xếp kiểu gì cũng vẫn đứt", () => {
    const rows = [
      dong({ transactionDate: "2026-01-05", creditAmount: 30_000_000, runningBalance: 30_000_000 }),
      dong({ transactionDate: "2026-01-05", debitAmount: -1_000_000, runningBalance: 22_000_000 }),
    ];
    const kq = soatChuoiSoDu(sapLaiTheoChuoi(rows));
    expect(kq.choDut).toHaveLength(1);
    expect(kq.chiSaiThuTu).toBe(false);
  });
});

describe("soatFile", () => {
  const doc = {
    accountNumber: "19001234567",
    rows: [
      dong({ transactionDate: "2026-04-01", referenceNumber: "A", creditAmount: 10_000_000, runningBalance: 110_000_000 }),
      dong({ transactionDate: "2026-04-02", referenceNumber: "B", debitAmount: -2_000_000, runningBalance: 108_000_000 }),
    ],
  };

  test("đếm đúng dòng mới và dòng đã có", () => {
    const daCo = new Set([khoaDong(doc.rows[0])]);
    const kq = soatFile(doc, daCo, 100_000_000, "2026-03-31");
    expect(kq.tongDong).toBe(2);
    expect(kq.dongTrung).toBe(1);
    expect(kq.dongMoi).toBe(1);
    expect(kq.tuNgay).toBe("2026-04-01");
    expect(kq.denNgay).toBe("2026-04-02");
  });

  test("nối tiếp khớp số dư cuối của phần đã có", () => {
    const kq = soatFile(doc, new Set(), 100_000_000, "2026-03-31");
    expect(kq.noiTiepDuoc).toBe(true);
    expect(kq.chenhNoiTiep).toBe(0);
  });

  test("giữa phần đã có và file mới bị hụt thì báo không nối tiếp", () => {
    const kq = soatFile(doc, new Set(), 80_000_000, "2026-03-31");
    expect(kq.noiTiepDuoc).toBe(false);
    expect(kq.chenhNoiTiep).toBe(20_000_000);
  });

  test("app chưa có giao dịch nào thì không kết luận nối tiếp", () => {
    const kq = soatFile(doc, new Set(), null, null);
    expect(kq.noiTiepDuoc).toBeNull();
  });
});
