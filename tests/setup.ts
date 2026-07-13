import * as dotenv from "dotenv";
import * as path from "path";

// LUÔN đọc .env.test.local; TEST_DATABASE_URL trong file này ghi đè DATABASE_URL
// để chắc chắn không đụng prod. Tests CRUD sẽ throw nếu TEST_DATABASE_URL không có.
const envTest = path.resolve(process.cwd(), ".env.test.local");
const envLocal = path.resolve(process.cwd(), ".env.local");

dotenv.config({ path: envTest, quiet: true });
dotenv.config({ path: envLocal, quiet: true }); // để có các env khác (SUPABASE_URL, ...)

// Nếu có TEST_DATABASE_URL thì override — pattern rõ ràng, không nhầm prod
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

// Warning nếu DATABASE_URL vẫn đang trỏ prod (không có TEST_DATABASE_URL)
if (!process.env.TEST_DATABASE_URL) {
  console.warn(
    "\n[test-setup] ⚠️  TEST_DATABASE_URL chưa đặt trong .env.test.local — DB tests sẽ bị skip.",
  );
  console.warn(
    "Tạo 1 Supabase project test riêng rồi đặt TEST_DATABASE_URL=postgresql://... vào .env.test.local\n",
  );
}
