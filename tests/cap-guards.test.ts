import { describe, test, expect, beforeAll, afterAll } from "vitest";
import postgres from "postgres";

import {
  assertRevenueCapNotExceeded,
  assertCostCapNotExceeded,
  assertPmgCumulativePctInRange,
  assertPaymentProgressPctInRange,
  assertPhasePctNotExceeded,
} from "@/lib/actions/cap-guards";

/**
 * Test cap-guards.ts — chặn đối chiếu vượt trần hợp đồng.
 *
 * Layout:
 *   Group A: pure function (không cần DB) — luôn chạy
 *   Group B: DB-dependent (dùng TEST DB) — skip nếu không connect được
 */

// ==================== GROUP A: PURE FUNCTIONS ====================

describe("cap-guards pure functions (không cần DB)", () => {
  describe("assertPmgCumulativePctInRange", () => {
    test("0 → cho qua", () => {
      expect(() => assertPmgCumulativePctInRange(0)).not.toThrow();
    });
    test("50% → cho qua", () => {
      expect(() => assertPmgCumulativePctInRange(0.5)).not.toThrow();
    });
    test("100% → cho qua", () => {
      expect(() => assertPmgCumulativePctInRange(1.0)).not.toThrow();
    });
    test("100.5% (trong tolerance 1%) → cho qua", () => {
      expect(() => assertPmgCumulativePctInRange(1.005)).not.toThrow();
    });
    test("102% → block", () => {
      expect(() => assertPmgCumulativePctInRange(1.02)).toThrow(/> 100%/);
    });
    test("110% → block với message hiển thị con số", () => {
      expect(() => assertPmgCumulativePctInRange(1.1)).toThrow(/110\.0%/);
    });
    test("Âm → block", () => {
      expect(() => assertPmgCumulativePctInRange(-0.1)).toThrow(/âm/);
    });
  });

  describe("assertPaymentProgressPctInRange", () => {
    test("0 → cho qua", () => {
      expect(() => assertPaymentProgressPctInRange(0)).not.toThrow();
    });
    test("100% → cho qua", () => {
      expect(() => assertPaymentProgressPctInRange(1.0)).not.toThrow();
    });
    test("100.5% → cho qua (tolerance)", () => {
      expect(() => assertPaymentProgressPctInRange(1.005)).not.toThrow();
    });
    test("105% → block", () => {
      expect(() => assertPaymentProgressPctInRange(1.05)).toThrow(/> 100%/);
    });
    test("Âm → block", () => {
      expect(() => assertPaymentProgressPctInRange(-0.5)).toThrow(/âm/);
    });
  });
});

// ==================== GROUP B: DB-DEPENDENT ====================

const testDbUrl = process.env.TEST_DATABASE_URL;

// Probe connection trước khi register suite. Nếu fail → suite skip.
let dbAlive = false;
if (testDbUrl) {
  try {
    const probe = postgres(testDbUrl, { prepare: false, connect_timeout: 5, max: 1 });
    await probe`SELECT 1`;
    await probe.end();
    dbAlive = true;
  } catch {
    console.warn(
      "\n[cap-guards test] ⚠️  TEST_DATABASE_URL không connect được. DB-dependent tests skip. Kiểm tra .env.test.local.\n",
    );
  }
}

const dbSuite = dbAlive ? describe : describe.skip;

const PMG_BASE = 1_000_000_000;
const PMG_RATE = 0.05;
const HH_RATE = 0.55;
const KPI_CEO_RATE = 0.03;
const CDT_BONUS_SALE_TARGET = 10_000_000;
const CUSTOMER_SUPPORT_TARGET = 5_000_000;

const REVENUE_CAP = PMG_BASE * PMG_RATE; // 50M
const HH_CAP = PMG_BASE * PMG_RATE * HH_RATE; // 27.5M
const KPI_CEO_CAP = PMG_BASE * PMG_RATE * KPI_CEO_RATE; // 1.5M

dbSuite("cap-guards DB-dependent (dùng seed data)", () => {
  let sql: ReturnType<typeof postgres>;
  let partnerId: number;
  let projectId: number;
  let productId: number;

  beforeAll(async () => {
    sql = postgres(testDbUrl!, { prepare: false, transform: { undefined: null } });

    const [partner] = await sql`
      INSERT INTO partners (code, name, type)
      VALUES ('TEST_CAP_PARTNER', 'TEST CAP', 'cdt')
      ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    `;
    partnerId = partner.id;

    const [project] = await sql`
      INSERT INTO projects (code, full_code, name, partner_id, bre_role)
      VALUES ('TEST_CAP', 'TEST_CAP_TEST_CAP', 'TEST CAP PROJECT', ${partnerId}, 'f1')
      ON CONFLICT (full_code) DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    `;
    projectId = project.id;

    const [product] = await sql`
      INSERT INTO products (
        product_code, unit_code, sale_type, project_id,
        pmg_base_price, pmg_rate, sale_commission_rate,
        kpi_ceo_rate, cdt_bonus_sale, customer_support
      )
      VALUES (
        'TEST_CAP_PRODUCT', 'TEST_CAP_UNIT', 'primary', ${projectId},
        ${PMG_BASE}, ${PMG_RATE}, ${HH_RATE},
        ${KPI_CEO_RATE}, ${CDT_BONUS_SALE_TARGET}, ${CUSTOMER_SUPPORT_TARGET}
      )
      ON CONFLICT (product_code) DO UPDATE SET
        pmg_base_price = EXCLUDED.pmg_base_price,
        pmg_rate = EXCLUDED.pmg_rate,
        sale_commission_rate = EXCLUDED.sale_commission_rate,
        kpi_ceo_rate = EXCLUDED.kpi_ceo_rate,
        cdt_bonus_sale = EXCLUDED.cdt_bonus_sale,
        customer_support = EXCLUDED.customer_support
      RETURNING id
    `;
    productId = product.id;

    await sql`DELETE FROM revenue_reconciliations WHERE product_id = ${productId}`;
    await sql`DELETE FROM cost_reconciliations WHERE product_id = ${productId}`;
  });

  afterAll(async () => {
    if (!sql) return;
    await sql`DELETE FROM revenue_reconciliations WHERE product_id = ${productId}`;
    await sql`DELETE FROM cost_reconciliations WHERE product_id = ${productId}`;
    await sql`DELETE FROM products WHERE id = ${productId}`;
    await sql`DELETE FROM projects WHERE id = ${projectId}`;
    await sql`DELETE FROM partners WHERE id = ${partnerId}`;
    await sql.end();
  });

  describe("assertRevenueCapNotExceeded", () => {
    test("Chưa có recon nào, thêm ≤ trần → cho qua", async () => {
      await expect(assertRevenueCapNotExceeded(productId, REVENUE_CAP)).resolves.toBeUndefined();
    });

    test("Chưa có recon nào, thêm vượt trần → block", async () => {
      await expect(assertRevenueCapNotExceeded(productId, REVENUE_CAP * 1.5)).rejects.toThrow(
        /Vượt trần doanh thu/,
      );
    });

    test("Tolerance 1% — thêm 100.5% trần → cho qua", async () => {
      await expect(
        assertRevenueCapNotExceeded(productId, REVENUE_CAP * 1.005),
      ).resolves.toBeUndefined();
    });

    test("Tolerance 1% — thêm 102% trần → block", async () => {
      await expect(assertRevenueCapNotExceeded(productId, REVENUE_CAP * 1.02)).rejects.toThrow(
        /Vượt trần doanh thu/,
      );
    });

    test("Đã có 40M trước, thêm 15M → tổng 55M vượt 50M → block", async () => {
      const [existing] = await sql`
        INSERT INTO revenue_reconciliations (product_id, total_receivable_this_time)
        VALUES (${productId}, 40000000) RETURNING id
      `;
      await expect(assertRevenueCapNotExceeded(productId, 15_000_000)).rejects.toThrow(
        /Vượt trần doanh thu/,
      );
      await sql`DELETE FROM revenue_reconciliations WHERE id = ${existing.id}`;
    });

    test("Update path — loại trừ chính mình khỏi tổng khi tính", async () => {
      const [rec] = await sql`
        INSERT INTO revenue_reconciliations (product_id, total_receivable_this_time)
        VALUES (${productId}, 40000000) RETURNING id
      `;
      await expect(
        assertRevenueCapNotExceeded(productId, 45_000_000, rec.id),
      ).resolves.toBeUndefined();
      await expect(
        assertRevenueCapNotExceeded(productId, 60_000_000, rec.id),
      ).rejects.toThrow(/Vượt trần doanh thu/);
      await sql`DELETE FROM revenue_reconciliations WHERE id = ${rec.id}`;
    });

    test("Product không có PMG target (pmg_base=0) → skip check", async () => {
      const [prod] = await sql`
        INSERT INTO products (product_code, unit_code, sale_type, project_id, pmg_base_price, pmg_rate)
        VALUES ('TEST_CAP_NO_PMG', 'TEST_CAP_UNIT_NO_PMG', 'primary', ${projectId}, 0, 0)
        RETURNING id
      `;
      await expect(assertRevenueCapNotExceeded(prod.id, 99_999_999_999)).resolves.toBeUndefined();
      await sql`DELETE FROM products WHERE id = ${prod.id}`;
    });
  });

  describe("assertCostCapNotExceeded", () => {
    test("HH sale ≤ trần → cho qua", async () => {
      await expect(
        assertCostCapNotExceeded(productId, "sale_commission", HH_CAP),
      ).resolves.toBeUndefined();
    });

    test("HH sale vượt trần → block với label 'HH sale (PMG × %HH sale)'", async () => {
      await expect(
        assertCostCapNotExceeded(productId, "sale_commission", HH_CAP * 2),
      ).rejects.toThrow(/HH sale/);
    });

    test("KPI CEO vượt trần → block", async () => {
      await expect(
        assertCostCapNotExceeded(productId, "kpi_ceo", KPI_CEO_CAP * 3),
      ).rejects.toThrow(/KPI CEO/);
    });

    test("CĐT thưởng NVKD ≤ target (10M) → cho qua", async () => {
      await expect(
        assertCostCapNotExceeded(productId, "cdt_bonus_sale", 8_000_000),
      ).resolves.toBeUndefined();
    });

    test("CĐT thưởng NVKD vượt target → block", async () => {
      await expect(
        assertCostCapNotExceeded(productId, "cdt_bonus_sale", 15_000_000),
      ).rejects.toThrow(/CĐT thưởng NVKD/);
    });

    test("Customer support vượt cam kết → block", async () => {
      await expect(
        assertCostCapNotExceeded(productId, "customer_support", 20_000_000),
      ).rejects.toThrow(/Hỗ trợ khách/);
    });

    test("Cost type không có cap config → skip", async () => {
      await expect(
        assertCostCapNotExceeded(productId, "unknown_type", 999_999_999),
      ).resolves.toBeUndefined();
    });

    test("Đã có 20M HH sale, thêm 10M → tổng 30M vượt 27.5M → block", async () => {
      const [existing] = await sql`
        INSERT INTO cost_reconciliations (product_id, employee_name, cost_type, amount_payable_this_time)
        VALUES (${productId}, 'test', 'sale_commission', 20000000) RETURNING id
      `;
      await expect(
        assertCostCapNotExceeded(productId, "sale_commission", 10_000_000),
      ).rejects.toThrow(/HH sale/);
      await sql`DELETE FROM cost_reconciliations WHERE id = ${existing.id}`;
    });

    test("Update path HH sale — loại trừ chính mình", async () => {
      const [rec] = await sql`
        INSERT INTO cost_reconciliations (product_id, employee_name, cost_type, amount_payable_this_time)
        VALUES (${productId}, 'test', 'sale_commission', 20000000) RETURNING id
      `;
      await expect(
        assertCostCapNotExceeded(productId, "sale_commission", 25_000_000, rec.id),
      ).resolves.toBeUndefined();
      await expect(
        assertCostCapNotExceeded(productId, "sale_commission", 30_000_000, rec.id),
      ).rejects.toThrow(/HH sale/);
      await sql`DELETE FROM cost_reconciliations WHERE id = ${rec.id}`;
    });
  });

  describe("assertPhasePctNotExceeded", () => {
    test("newPhasePct = 0 → skip (không check)", async () => {
      await expect(assertPhasePctNotExceeded(productId, 0)).resolves.toBeUndefined();
    });

    test("Chưa có recon, thêm 50% → cho qua", async () => {
      await expect(assertPhasePctNotExceeded(productId, 0.5)).resolves.toBeUndefined();
    });

    test("Đã có 60% + 30% = 90%, thêm 5% → tổng 95% → cho qua", async () => {
      const rec1 = await sql`
        INSERT INTO revenue_reconciliations (product_id, phase_pct_this_time, total_receivable_this_time)
        VALUES (${productId}, 0.6, 1) RETURNING id
      `;
      const rec2 = await sql`
        INSERT INTO revenue_reconciliations (product_id, phase_pct_this_time, total_receivable_this_time)
        VALUES (${productId}, 0.3, 1) RETURNING id
      `;
      await expect(assertPhasePctNotExceeded(productId, 0.05)).resolves.toBeUndefined();
      await sql`DELETE FROM revenue_reconciliations WHERE id IN (${rec1[0].id}, ${rec2[0].id})`;
    });

    test("Đã có 90%, thêm 15% → tổng 105% → block", async () => {
      const [rec] = await sql`
        INSERT INTO revenue_reconciliations (product_id, phase_pct_this_time, total_receivable_this_time)
        VALUES (${productId}, 0.9, 1) RETURNING id
      `;
      await expect(assertPhasePctNotExceeded(productId, 0.15)).rejects.toThrow(
        /Vượt trần tiến độ/,
      );
      await sql`DELETE FROM revenue_reconciliations WHERE id = ${rec.id}`;
    });
  });
});
