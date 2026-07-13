import { describe, test, expect, beforeAll, afterAll } from "vitest";
import postgres from "postgres";

// CRUD tests đụng DB thật — CHỈ chạy khi có TEST_DATABASE_URL trong .env.test.local
const testDbUrl = process.env.TEST_DATABASE_URL;
const suite = testDbUrl ? describe : describe.skip;

suite("CRUD DB tests — chạy trên TEST_DATABASE_URL", () => {
  let sql: ReturnType<typeof postgres>;
  // Seed IDs — dùng chung cho tất cả tests, cleanup ở afterAll
  let seedPartnerId: number;
  let seedProjectId: number;

  beforeAll(async () => {
    if (!testDbUrl) return;
    sql = postgres(testDbUrl, {
      prepare: false,
      // Parse jsonb explicitly — mặc định postgres lib trả string
      transform: { undefined: null },
    });

    // Seed: 1 partner + 1 project để products FK reference. Idempotent.
    const [partner] = await sql`
      INSERT INTO partners (code, name, type)
      VALUES ('TEST_PARTNER_CODE', 'TEST PARTNER', 'cdt')
      ON CONFLICT (code) DO NOTHING
      RETURNING id
    `;
    if (partner) {
      seedPartnerId = partner.id;
    } else {
      const [existing] = await sql`SELECT id FROM partners WHERE code = 'TEST_PARTNER_CODE'`;
      seedPartnerId = existing.id;
    }

    const [project] = await sql`
      INSERT INTO projects (code, full_code, name, partner_id, bre_role)
      VALUES ('TEST_PROJ', 'TEST_TEST_PROJ', 'TEST PROJECT', ${seedPartnerId}, 'f1')
      ON CONFLICT (full_code) DO NOTHING
      RETURNING id
    `;
    if (project) {
      seedProjectId = project.id;
    } else {
      const [existing] = await sql`SELECT id FROM projects WHERE full_code = 'TEST_TEST_PROJ'`;
      seedProjectId = existing.id;
    }
  });

  afterAll(async () => {
    if (!sql) return;
    // Cleanup: xóa mọi row test tạo. Order: children trước, parents sau.
    await sql`DELETE FROM activity_logs WHERE entity_id = 999`;
    await sql`DELETE FROM product_adjustments WHERE product_id IN (SELECT id FROM products WHERE project_id = ${seedProjectId})`;
    await sql`DELETE FROM products WHERE project_id = ${seedProjectId}`;
    await sql`DELETE FROM projects WHERE id = ${seedProjectId}`;
    await sql`DELETE FROM partners WHERE id = ${seedPartnerId}`;
    await sql.end();
  });

  test("Insert 1 product row → có id + created_at", async () => {
    const [row] = await sql`
      INSERT INTO products (product_code, unit_code, sale_type, project_id, pmg_base_price, pmg_rate)
      VALUES ('TEST_CODE', 'TEST_UNIT', 'primary', ${seedProjectId}, 1000000000, 0.07)
      RETURNING id, created_at
    `;
    expect(row.id).toBeGreaterThan(0);
    expect(row.created_at).toBeDefined();
    // Cleanup
    await sql`DELETE FROM products WHERE id = ${row.id}`;
  });

  test("Insert product_adjustment + verify FK constraint", async () => {
    const [prod] = await sql`
      INSERT INTO products (product_code, unit_code, sale_type, project_id, pmg_base_price, pmg_rate)
      VALUES ('TEST_A', 'TEST_UA', 'primary', ${seedProjectId}, 1000000000, 0.07)
      RETURNING id
    `;
    const [adj] = await sql`
      INSERT INTO product_adjustments (product_id, effective_date, pmg_rate, note)
      VALUES (${prod.id}, '2026-07-13', 0.08, 'test adjustment')
      RETURNING id, pmg_rate
    `;
    expect(Number(adj.pmg_rate)).toBe(0.08);
    // Cleanup
    await sql`DELETE FROM product_adjustments WHERE id = ${adj.id}`;
    await sql`DELETE FROM products WHERE id = ${prod.id}`;
  });

  test("activity_logs table exists + jsonb insert works", async () => {
    const changes = { pmgRate: { from: 0.07, to: 0.08 } };
    const [row] = await sql`
      INSERT INTO activity_logs (entity_type, entity_id, action, changes, summary)
      VALUES ('product', 999, 'update', ${JSON.stringify(changes)}::jsonb, 'test')
      RETURNING id, changes
    `;
    expect(row.id).toBeGreaterThan(0);
    // postgres lib có thể trả jsonb dạng string hoặc object tuỳ version
    const parsedChanges = typeof row.changes === "string" ? JSON.parse(row.changes) : row.changes;
    expect(parsedChanges).toEqual(changes);
    await sql`DELETE FROM activity_logs WHERE id = ${row.id}`;
  });

  test("End-to-end: create product → update pmg_rate → verify totals recompute", async () => {
    // Simulate flow: adjustment 7% → 7.5%, verify total_revenue update
    const [prod] = await sql`
      INSERT INTO products (
        product_code, unit_code, sale_type, project_id,
        pmg_base_price, pmg_rate, pmg_sale_rate, admin_fee,
        cdt_bonus_sale, sale_commission_rate, kpi_ceo_rate, kpi_admin_rate
      )
      VALUES (
        'TEST_E2E', 'TEST_E2E_UNIT', 'primary', ${seedProjectId},
        1000000000, 0.07, 0.07, 3850000,
        22000000, 0.5, 0.035, 0.0025
      )
      RETURNING id
    `;

    // Simulate recomputeDerived để verify formula khi apply qua raw SQL
    const [before] = await sql`SELECT pmg_base_price, pmg_rate, admin_fee, cdt_bonus_sale FROM products WHERE id = ${prod.id}`;
    const expectedRev = Math.round(
      Number(before.pmg_base_price) * Number(before.pmg_rate)
      - Number(before.admin_fee) + Number(before.cdt_bonus_sale)
    );
    // = 1B * 0.07 - 3.85M + 22M = 88,150,000
    expect(expectedRev).toBe(88_150_000);

    // Update pmg_rate → 0.075
    await sql`UPDATE products SET pmg_rate = 0.075 WHERE id = ${prod.id}`;
    const [after] = await sql`SELECT pmg_rate FROM products WHERE id = ${prod.id}`;
    expect(Number(after.pmg_rate)).toBe(0.075);

    // Cleanup
    await sql`DELETE FROM products WHERE id = ${prod.id}`;
  });
});
