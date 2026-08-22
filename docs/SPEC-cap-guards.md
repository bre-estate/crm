# SPEC — Cap Guards (chặn đối chiếu vượt trần hợp đồng)

**File**: [lib/actions/cap-guards.ts](../lib/actions/cap-guards.ts)
**Wire vào**: [lib/actions/revenues.ts](../lib/actions/revenues.ts), [lib/actions/costs.ts](../lib/actions/costs.ts)
**Test**: [tests/cap-guards.test.ts](../tests/cap-guards.test.ts)
**Chốt lần đầu**: 2026-08-23 (sau case #4301 — admin nhập DT Fenica A.08-10 nhưng chọn nhầm dropdown căn thành ATSR_DXMD_A-05-07)

## Vấn đề

Trước bản này, form đối chiếu doanh thu / giá vốn cho lưu bất kỳ số tiền + căn nào. Admin chọn nhầm dropdown căn → App vẫn insert. 2 kiểu sai:
1. **Nhầm căn**: DT của căn A đưa vào căn B, tổng căn B vượt cam kết hợp đồng
2. **Dup**: đối chiếu 1 đợt 2 lần → tổng % đối chiếu > 100%

## Rule tổng quát

**Mọi số tiền lũy kế hoặc % lũy kế trên 1 căn không được vượt trần cam kết trong hợp đồng.** Vượt trần = báo lỗi, KHÔNG cho lưu.

Tolerance 1% cho rounding: sum ≤ cap × 1.01 → cho qua, > 1.01 → block. VD: cap 50M → cho qua nếu tổng 50.5M, chặn từ 50.6M trở lên.

## Danh sách trần

### Doanh thu (`revenue_reconciliations`)

| Check | Trần | Nguồn công thức |
|---|---|---|
| Σ `total_receivable_this_time` | `pmg_base_price × pmg_rate` | Doanh thu cam kết trong hợp đồng CĐT |
| Σ `phase_pct_this_time` | 100% | Tổng tiến độ đối chiếu đợt |
| `pmg_cumulative_pct` mỗi dòng | 100% | % PMG lũy kế phải ≤ 100% |

### Giá vốn (`cost_reconciliations`)

| `cost_type` | Trần | Nguồn |
|---|---|---|
| `sale_commission` | `pmg_base × pmg_rate × sale_commission_rate` | HH sale (PMG × %HH sale) |
| `cdt_bonus_sale` | `products.cdt_bonus_sale` | CĐT thưởng NVKD (số cam kết) |
| `cdt_bonus_manager` | `products.cdt_bonus_manager` | CĐT thưởng QL sàn |
| `bonus_sale` | `products.bonus_sale` | CTY thưởng sale |
| `bonus_manager` | `products.bonus_manager` | CTY thưởng QL |
| `kpi_ceo` | `pmg × kpi_ceo_rate` | KPI CEO (PMG × %KPI CEO) |
| `kpi_tpkd` | `pmg × kpi_tpkd_rate` | KPI TPKD |
| `kpi_admin` | `pmg × kpi_admin_rate` | KPI Admin (kèm rule 1 lần/căn) |
| `customer_support` | `products.customer_support` | HTK cam kết |
| `payment_progress_pct` (N) mỗi dòng | 100% | Tiến độ khách đóng lũy kế |

## Khi nào chạy guard

Chạy TRƯỚC insert / update trong 4 server actions:

- [`createRevenue()`](../lib/actions/revenues.ts) — trước `db.insert(revenueReconciliations)`
- [`updateRevenue()`](../lib/actions/revenues.ts) — trước `db.update()`, exclude id đang sửa khỏi tổng
- [`createCost()`](../lib/actions/costs.ts) — trước `db.insert(costReconciliations)`
- [`updateCost()`](../lib/actions/costs.ts) — trước `db.update()`, exclude id đang sửa

Guard throw `Error` với message tiếng Việt. Server action fail → toast đỏ trên UI.

## Format thông báo lỗi

Ví dụ:

> "Vượt trần doanh thu căn ATSR_DXMD_A-05-07: tổng sau khi lưu = 286.013.321 VND (117.4% trần). Trần hợp đồng = 243.710.739 VND (PMG × %PMG_LK). Kiểm tra lại số tiền hoặc căn được chọn."

Bắt buộc chứa: mã căn + tổng dự kiến + % vượt + cap + gợi ý "kiểm tra căn hoặc số tiền".

## Edge cases

- **Product chưa nhập PMG target** (`pmg_base = 0` hoặc `pmg_rate = 0`) → guard **skip**, không chặn. Do chưa có cap không thể check.
- **Product chưa nhập rate cho 1 loại chi phí** (VD `bonus_manager = 0`) → guard skip cho loại đó.
- **Cost type không có trong bảng cap** (VD giá trị lạ) → guard skip, không throw.
- **Sum() với 0 rows** → `COALESCE(SUM, 0)` trả 0, không NULL.

## Không xử lý (deferred)

- **Race condition khi 2 admin nhập cùng lúc**: cả 2 pass check (đọc tổng cũ), insert xong tổng vượt trần. Hiện chấp nhận, sẽ giải quyết bằng transaction lock hoặc post-save alert nếu xảy ra thực tế.
- **Unique số BB (`minutes_number`) per căn**: user tạm hoãn ("Khoan tính tới số BB", 2026-08-23). Nếu cần sau này thêm unique constraint DB + guard.
- **Formula check per row** (`amount ≈ pmg × %lk × phase%`): không reliable vì admin thường bỏ trống `phase_pct_this_time`.

## Test coverage

**Pure functions** (12 tests — luôn chạy):
- `assertPmgCumulativePctInRange`: 0, 50%, 100%, 100.5%, 102%, 110%, âm
- `assertPaymentProgressPctInRange`: 0, 100%, 100.5%, 105%, âm

**DB-dependent** (20 tests — cần `TEST_DATABASE_URL`):
- `assertRevenueCapNotExceeded`: chưa recon nào cho qua/block, tolerance edge, cumulative, update-exclude-self, no-PMG-target skip
- `assertCostCapNotExceeded`: mọi cost_type (HH sale, KPI CEO, CĐT thưởng, HTK), unknown type skip, cumulative, update-exclude-self
- `assertPhasePctNotExceeded`: skip khi 0, cumulative pass/block

Chạy: `npm test tests/cap-guards.test.ts`

DB-dependent tests hiện SKIP vì `TEST_DATABASE_URL` trỏ đến Supabase project cũ đã xóa. Khi có TEST DB mới, các test tự chạy.

## Rollback

Xóa 4 chỗ import + gọi guard trong `revenues.ts` + `costs.ts` là tắt được. Guard chỉ throw, không mutate DB.
