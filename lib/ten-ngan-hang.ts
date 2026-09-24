/**
 * Quy tên ngân hàng trên sao kê về tên gọi quen thuộc.
 *
 * Techcombank xuất ra đủ kiểu cho cùng một ngân hàng: "A CHAU (ACB)",
 * "Ngan hang a chau IBT SMARLINK", "NH TMCP A Chau CN Sai Gon", "NH TMCP a Chau CN Ha Noi".
 * Đọc bốn dòng đó mà biết là ACB thì mất công, nên gom hết về một tên.
 *
 * Còn dính thêm đuôi chi nhánh và mã nước kiểu "HANOI VNM", "704", "Ebanking".
 */

/** Ghép theo thứ tự, cái nào khớp trước thì lấy. Đặt tên riêng trước tên chung. */
const LUAT: [RegExp, string][] = [
  [/vietcombank|ngoai thuong/i, "VIETCOMBANK"],
  [/vietinbank|cong thuong/i, "VIETINBANK"],
  [/\bbidv\b|dau tu va phat trien|đt&(amp;)?pt|dt&pt|truong son/i, "BIDV"],
  [/agribank|nong nghiep/i, "AGRIBANK"],
  [/\bacb\b|a chau/i, "ACB"],
  [/maritime|\bmsb\b|hang hai/i, "MSB"],
  [/techcombank|ky thuong/i, "TECHCOMBANK"],
  [/vpbank|\bvpb\b|thinh vuong/i, "VPBANK"],
  [/tpbank|tienphong|tien phong/i, "TPBANK"],
  [/sacombank|sai gon thuong tin|sai gon tai loc/i, "SACOMBANK"],
  [/\bshb\b|sai gon - ha noi/i, "SHB"],
  [/hdbank|phat trien tp hcm/i, "HDBANK"],
  [/\bocb\b|phuong dong/i, "OCB"],
  [/\bvib\b|quoc te/i, "VIB"],
  [/eximbank|\beib\b|xuat nhap khau/i, "EXIMBANK"],
  [/pvcombank|\bpvcb\b|dai chung/i, "PVCOMBANK"],
  [/shinhan/i, "SHINHAN"],
  [/woori/i, "WOORI"],
  [/abbank|an binh/i, "ABBANK"],
  [/ban viet|bvbank/i, "BVBANK"],
  [/vikki/i, "VIKKIBANK"],
  [/seabank|dong a|\bdab\b/i, "SEABANK"],
  [/\bmb\b|quan doi|mbbank/i, "MB"],
];

/** Đuôi rác trên sao kê: chi nhánh, mã nước, kênh giao dịch. */
const DUOI_RAC =
  /\b(hanoi|ha noi|hcmc?|tp\.? ?hcm|sai gon|vnm|704|750|412 ntmk|ebanking|e-banking|ibanking|i-banking|smartlink|smarlink|napas|hoi so|chi nh\w*|cn|ntmk)\b/gi;

/**
 * Trả về tên gọn. Không nhận ra ngân hàng nào thì dọn đuôi rác rồi trả lại bản viết hoa,
 * chứ không nuốt mất thông tin.
 */
export function tenNganHangGon(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  for (const [re, ten] of LUAT) if (re.test(s)) return ten;

  const don = s
    .replace(/&amp;/g, "&")
    .replace(DUOI_RAC, " ")
    .replace(/\b(ngan hang|nh tmcp|nhtmcp|ngân hàng|ibt)\b/gi, " ")
    .replace(/[()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return don ? don.toUpperCase() : null;
}
