import { describe, test, expect, beforeAll, afterAll } from "vitest";
import postgres from "postgres";

// CRUD tests đụng DB thật — CHỈ chạy khi có TEST_DATABASE_URL trong .env.test.local
// Tạo 1 Supabase project riêng cho test, đưa URL vào file → tests tự run.
// Không có → describe.skip toàn bộ (không fail suite).

const testDbUrl = process.env.TEST_DATABASE_URL;
const suite = testDbUrl ? describe : describe.skip;

suite("CRUD DB tests — chạy trên TEST_DATABASE_URL", () => {
  let sql: ReturnType<typeof postgres>;

  beforeAll(async () => {
    if (!testDbUrl) return;
    sql = postgres(testDbUrl, { prepare: false });
    // TODO: chạy migrations trên test DB nếu chưa có tables
    // Hiện tại giả định user đã chạy `psql < drizzle/000X.sql` trên test DB
  });

  afterAll(async () => {
    if (sql) await sql.end();
  });

  test("Insert 1 product row → có id + created_at", async () => {
    const [row] = await sql`
      INSERT INTO products (product_code, unit_code, sale_type, pmg_base_price, pmg_rate)
      VALUES ('TEST_CODE', 'TEST_UNIT', 'primary', 1000000000, 0.07)
      RETURNING id, created_at
    `;
    expect(row.id).toBeGreaterThan(0);
    expect(row.created_at).toBeDefined();
    // Cleanup
    await sql`DELETE FROM products WHERE id = ${row.id}`;
  });

  test("Insert product_adjustment + verify FK constraint", async () => {
    const [prod] = await sql`
      INSERT INTO products (product_code, unit_code, sale_type, pmg_base_price, pmg_rate)
      VALUES ('TEST_A', 'TEST_UA', 'primary', 1000000000, 0.07)
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

  test("activity_logs table exists + insert works", async () => {
    const [row] = await sql`
      INSERT INTO activity_logs (entity_type, entity_id, action, changes, summary)
      VALUES ('product', 999, 'update', ${JSON.stringify({ x: { from: 1, to: 2 } })}::jsonb, 'test')
      RETURNING id, changes
    `;
    expect(row.id).toBeGreaterThan(0);
    expect(row.changes).toEqual({ x: { from: 1, to: 2 } });
    await sql`DELETE FROM activity_logs WHERE id = ${row.id}`;
  });

  // TODO khi muốn cover full flow:
  // - createProduct → verify DB row
  // - updateProduct with __pendingAdjustments JSON → verify adjustments + config updated + recomputed
  // - deleteProduct → verify FK cascade
  // Cần workaround createClient() từ next/headers — dùng mock hoặc test framework khác
});
