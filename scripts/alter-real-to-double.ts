/**
 * ALTER COLUMN tất cả real → double precision cho các bảng.
 * PostgreSQL tự cast float4 → float8 không mất dữ liệu (nhưng precision loss
 * từ trước vẫn còn — cần re-import để lấy lại số chính xác).
 */
import postgres from "postgres";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const client = postgres(process.env.DATABASE_URL!, { prepare: false });

async function main() {
  // Query all columns có type = real trong DB
  const cols = await client<{ table_name: string; column_name: string }[]>`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND data_type = 'real'
    ORDER BY table_name, column_name;
  `;
  console.log(`Found ${cols.length} real columns:`);
  for (const c of cols) console.log(`  ${c.table_name}.${c.column_name}`);

  for (const c of cols) {
    const sql = `ALTER TABLE ${c.table_name} ALTER COLUMN ${c.column_name} TYPE double precision USING ${c.column_name}::double precision;`;
    await client.unsafe(sql);
    process.stdout.write(".");
  }
  console.log(`\nDone. Altered ${cols.length} columns.`);
  await client.end();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
