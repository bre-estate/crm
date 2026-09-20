import postgres from "postgres";

/**
 * Thử kết nối TEST_DATABASE_URL trước khi đăng ký bộ test cần database.
 *
 * Có biến môi trường KHÔNG có nghĩa là kết nối được: URL có thể trỏ tới một
 * Supabase tenant đã xoá. Chỉ kiểm sự tồn tại của biến thì bộ test đổ ở beforeAll,
 * kêu đỏ một file và che mất lỗi thật ở những file khác.
 *
 * Dùng: const dbSuite = await probeDb("tên bộ test") ? describe : describe.skip;
 */
export async function probeDb(tenBoTest: string): Promise<boolean> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return false;
  try {
    const probe = postgres(url, { prepare: false, connect_timeout: 5, max: 1 });
    await probe`SELECT 1`;
    await probe.end();
    return true;
  } catch (e) {
    console.warn(
      `\n[${tenBoTest}] TEST_DATABASE_URL không kết nối được nên bỏ qua các test cần database.` +
        `\n  Lý do: ${e instanceof Error ? e.message : String(e)}` +
        `\n  Sửa TEST_DATABASE_URL trong .env.test.local nếu muốn chạy nhóm này.\n`,
    );
    return false;
  }
}
