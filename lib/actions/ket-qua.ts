/**
 * Khung trả lỗi cho mọi lệnh server (server action).
 *
 * Vì sao cần: bản production của Next.js THAY mọi lỗi throw từ server action bằng câu
 * "An error occurred in the Server Components render. The specific message is omitted
 * in production builds" kèm một mã digest. Nhân viên không biết mình sai gì để sửa.
 *
 * Cách dùng: bọc thân hàm bằng chay(), giữ nguyên các throw new Error("câu tiếng Việt")
 * đang có. Lỗi sẽ được trả về dạng { error } để form hiện thẳng cho người dùng.
 *
 *   export async function createProduct(fd: FormData): Promise<KetQuaLuu> {
 *     return chay(async () => {
 *       if (!data.unitCode) throw new Error("Nhập mã căn");
 *       ...
 *     });
 *   }
 *
 * Phía form thì gọi baoLoi(await action(...)) — xem lib/bao-loi.ts.
 */

/** Kết quả trả về form. Có error thì form hiện câu đó, không có nghĩa là lệnh đã chạy xong. */
export type KetQuaLuu = { error: string } | void;

/**
 * redirect() và notFound() của Next.js hoạt động bằng cách throw một lỗi đặc biệt.
 * Bắt nhầm hai cái đó thì trang không chuyển được, nên phải để chúng bay tiếp.
 */
export function laDieuHuong(e: unknown): boolean {
  const digest = (e as { digest?: unknown } | null)?.digest;
  return (
    typeof digest === "string" &&
    (digest.startsWith("NEXT_REDIRECT") || digest === "NEXT_NOT_FOUND")
  );
}

/** Chạy thân lệnh, đổi lỗi kiểm tra thành câu chữ trả về cho form. */
export async function chay(than: () => Promise<void>): Promise<KetQuaLuu> {
  try {
    await than();
  } catch (e) {
    if (laDieuHuong(e)) throw e;
    return { error: cauLoi(e) };
  }
}

/** Như chay() nhưng lệnh có trả về dữ liệu, ví dụ số dòng đã xoá. */
export async function chayCoKetQua<T>(
  than: () => Promise<T>,
): Promise<{ error: string } | { data: T }> {
  try {
    return { data: await than() };
  } catch (e) {
    if (laDieuHuong(e)) throw e;
    return { error: cauLoi(e) };
  }
}

/**
 * Đổi lỗi thành câu người thường đọc được. Lỗi tự viết trong code thì giữ nguyên câu,
 * lỗi hệ thống (Postgres, mạng) thì thay bằng câu dễ hiểu kèm gợi ý xử lý.
 */
export function cauLoi(e: unknown): string {
  if (!(e instanceof Error)) return "Không lưu được. Thử lại, nếu vẫn lỗi thì báo quản trị.";
  const raw = e.message ?? "";

  // Lỗi Postgres lọt ra ngoài: dịch sang câu nghiệp vụ.
  const code = (e as { code?: unknown }).code;
  if (typeof code === "string") {
    if (code === "23505") return "Dữ liệu này đã có trong hệ thống, không thêm trùng được.";
    if (code === "23503") return "Còn dữ liệu khác đang tham chiếu tới, xử lý chỗ đó trước đã.";
    if (code === "23502") return "Còn ô bắt buộc chưa điền.";
    if (code === "22P02" || code === "22007") return "Có ô nhập sai định dạng, kiểm tra lại ngày và số.";
    if (code === "57014") return "Truy vấn quá lâu nên bị ngắt. Thu hẹp khoảng thời gian rồi thử lại.";
    return "Lỗi khi ghi dữ liệu. Thử lại, nếu vẫn lỗi thì báo quản trị.";
  }

  // Câu do Next.js che lỗi thật, hoặc lỗi kỹ thuật lọt ra: đừng hiện nguyên văn.
  if (/Server Components render|omitted in production|digest/i.test(raw)) {
    return "Không lưu được và hệ thống chưa nêu được lý do. Chụp màn hình rồi báo quản trị.";
  }
  if (/fetch failed|ECONNREFUSED|ETIMEDOUT|socket hang up/i.test(raw)) {
    return "Mất kết nối tới máy chủ dữ liệu. Kiểm tra mạng rồi thử lại.";
  }
  if (!raw.trim()) return "Không lưu được. Thử lại, nếu vẫn lỗi thì báo quản trị.";
  return raw;
}
