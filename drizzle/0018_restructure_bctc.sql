-- Phase C: Restructure classifier + categories theo BCTC Kim (TT200) — 2026-07-27
-- BRE là DN dịch vụ → KHÔNG dùng TK 632 (giá vốn hàng bán).
-- Chi phí phân theo 641 (bán hàng) vs 642 (quản lý) vs 811 (chi khác) vs 242 (trả trước).

-- 1. Thêm categories mới
INSERT INTO accounting_categories (code, name, group_name, is_expense, display_order, group_bctc)
VALUES
  ('6411', 'Chi phí nhân viên bán hàng', '1a. Lương NVKD', true, 15, '641'),
  ('6423', 'Đồ dùng văn phòng', '6a. Đồ dùng VP', true, 55, '642'),
  ('811',  'Chi phí khác',                '10a. Chi phí khác (không hóa đơn)', true, 95, '811'),
  ('242',  'Chi phí trả trước',           '5a. TSCĐ phân bổ dần', true, 60, '242'),
  ('6427', 'Dịch vụ mua ngoài (quản lý)', '2. Thuê VP + tiện ích + dịch vụ', true, 25, '642')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  group_name = EXCLUDED.group_name,
  group_bctc = EXCLUDED.group_bctc;

-- 2. Update existing category codes (rename + regroup)
UPDATE accounting_categories SET
  name = 'HH sale + Marketing + Thưởng doanh số',
  group_name = '1b. Chi phí bán hàng khác',
  group_bctc = '641'
WHERE code = '6417';

UPDATE accounting_categories SET
  name = 'Chi phí nhân viên quản lý (Admin + kế toán)',
  group_name = '1c. Lương admin + kế toán',
  group_bctc = '642'
WHERE code = '6421';

UPDATE accounting_categories SET
  group_bctc = '642'
WHERE code = '6425';

-- 3. Migrate row-level category codes
-- 3.1 Toàn bộ 632 → 6417 (Kim gộp HH sale vào 6417)
UPDATE financial_transactions SET category_code = '6417' WHERE category_code = '632';

-- 3.2 6427-rent + 6427-svc → 6427 (Kim gộp)
UPDATE financial_transactions SET category_code = '6427' WHERE category_code IN ('6427-rent', '6427-svc');

-- 3.3 secondary → 811 (chi không hóa đơn từ Triết)
UPDATE financial_transactions SET category_code = '811' WHERE category_code = 'secondary';

-- 3.4 153-211 → 242 (chi phí trả trước, phân bổ)
UPDATE financial_transactions SET category_code = '242' WHERE category_code = '153-211';

-- 3.5 6428 tách 3 nhóm theo description
-- Tiếp khách/hỗ trợ khách/du lịch/team building/khai trương → 6417 (bán hàng)
UPDATE financial_transactions SET category_code = '6417', management_group = '4. Chi phí bán hàng khác'
 WHERE category_code = '6428'
   AND (
     description ILIKE '%tiếp khách%' OR description ILIKE '%tiep khach%' OR
     description ILIKE '%tất niên%' OR description ILIKE '%tat nien%' OR
     description ILIKE '%liên hoan%' OR description ILIKE '%lien hoan%' OR
     description ILIKE '%du lịch%' OR description ILIKE '%du lich%' OR
     description ILIKE '%team building%' OR
     description ILIKE '%khai trương%' OR description ILIKE '%khai truong%' OR
     description ILIKE '%đi ăn%' OR description ILIKE '%di an%' OR
     description ILIKE '%nhậu%' OR description ILIKE '%nhau%' OR
     description ILIKE '%karaoke%' OR
     description ILIKE '%sinh nhật%' OR description ILIKE '%sinh nhat%'
   );

-- VPP, giấy, mực in, đồ dùng vệ sinh, đồng phục → 6423 (đồ dùng VP)
UPDATE financial_transactions SET category_code = '6423', management_group = '6a. Đồ dùng VP'
 WHERE category_code = '6428'
   AND (
     description ILIKE '%văn phòng phẩm%' OR description ILIKE '%van phong pham%' OR description ILIKE '%vpp%' OR
     description ILIKE '%giấy%' OR description ILIKE '%giay%' OR
     description ILIKE '%mực in%' OR description ILIKE '%muc in%' OR
     description ILIKE '%vệ sinh%' OR description ILIKE '%ve sinh%' OR
     description ILIKE '%đồng phục%' OR description ILIKE '%dong phuc%' OR
     description ILIKE '%bàn %' OR description ILIKE '%ban %' OR
     description ILIKE '%ghế%' OR description ILIKE '%ghe%' OR
     description ILIKE '%kệ %' OR description ILIKE '%ke %' OR
     description ILIKE '%thùng rác%' OR description ILIKE '%thung rac%' OR
     description ILIKE '%túi rác%' OR description ILIKE '%tui rac%' OR
     description ILIKE '%chổi%' OR description ILIKE '%choi%' OR
     description ILIKE '%tô %' OR description ILIKE '%to %' OR
     description ILIKE '%rượu%' OR description ILIKE '%ruou%'
   );

-- Còn lại 6428 → 6427 (dịch vụ mua ngoài quản lý)
UPDATE financial_transactions SET category_code = '6427', management_group = '2. Thuê VP + tiện ích + dịch vụ'
 WHERE category_code = '6428';

-- 4. Xóa categories cũ (không còn row nào tham chiếu)
DELETE FROM accounting_categories
 WHERE code IN ('632', '6427-rent', '6427-svc', '6428', '153-211', 'secondary');
