import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";
import postgres from "postgres";

// Load .env.test.local — TEST_DATABASE_URL bắt buộc
dotenv.config({
  path: path.resolve(process.cwd(), ".env.test.local"),
  quiet: true,
});

const dbUrl = process.env.TEST_DATABASE_URL;
if (!dbUrl) {
  console.error("❌ TEST_DATABASE_URL không có trong .env.test.local");
  console.error("   Tạo file rồi paste connection string từ Supabase.");
  process.exit(1);
}

// Safety: refuse chạy nếu URL trùng prod (nhỡ paste nhầm)
const prodUrl = (() => {
  try {
    dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), quiet: true, override: false });
    return process.env.DATABASE_URL;
  } catch {
    return null;
  }
})();
if (prodUrl && prodUrl === dbUrl) {
  console.error("❌ TEST_DATABASE_URL trùng DATABASE_URL prod! Refuse chạy.");
  process.exit(1);
}

async function main() {
  console.log("🔗 Kết nối test DB:", dbUrl!.replace(/:[^:@]+@/, ":****@"));
  const sql = postgres(dbUrl!, { prepare: false });

  // Danh sách migration files theo thứ tự
  const migrationsDir = path.resolve(process.cwd(), "drizzle");
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  console.log(`📁 Tìm thấy ${files.length} migration files`);

  for (const file of files) {
    const filepath = path.join(migrationsDir, file);
    const content = fs.readFileSync(filepath, "utf8");
    // Skip nếu file rỗng HOẶC chỉ toàn comment (không có statement thực sự)
    // Bug trước: startsWith("--") skip cả file có SQL sau comment header.
    const hasNonCommentLine = content
      .split("\n")
      .some((line) => line.trim() && !line.trim().startsWith("--"));
    if (!hasNonCommentLine) {
      console.log(`⏭️  ${file} — rỗng/toàn comment, skip`);
      continue;
    }
    try {
      await sql.unsafe(content);
      console.log(`✅ ${file}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Skip nếu table đã tồn tại (idempotent re-run)
      if (msg.includes("already exists")) {
        console.log(`⏭️  ${file} — objects đã tồn tại, skip`);
      } else {
        console.error(`❌ ${file}:`, msg);
      }
    }
  }

  // Verify: đếm tables
  const tables = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `;
  console.log(`\n📊 Tables trong test DB (${tables.length}):`);
  for (const t of tables) console.log(`   - ${t.table_name}`);

  await sql.end();
  console.log("\n✨ Setup xong. Chạy `npm test` để verify.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
