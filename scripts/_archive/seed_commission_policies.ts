/**
 * Migrate + seed commission_policies từ 6 file .docx.
 * Chạy: npx tsx scripts/seed_commission_policies.ts
 * Idempotent: dùng ON CONFLICT (role, effective_from) DO UPDATE.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import fs from "fs";
import path from "path";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);

  // 1. Apply migration nếu chưa
  const migPath = path.join(process.cwd(), "drizzle/0041_commission_policies.sql");
  const migSql = fs.readFileSync(migPath, "utf8");
  console.log("→ Chạy migration 0041_commission_policies.sql");
  await sql.unsafe(migSql);
  console.log("  ✓ table commission_policies ready");

  // 2. Seed 7 records (upsert)
  const policies = [
    // NVKD 3 giai đoạn
    {
      role: "nvkd",
      effective_from: "2025-04-10",
      effective_to: "2026-04-30",
      cycle_months: 2,
      base_rate: 0.5,
      tiers: [{ threshold: 200_000_000, rate: 0.55 }],
      base_salary: 6_500_000,
      probation_salary: 4_000_000,
      apprentice_salary: null,
      bonus_floor: 60_000_000,
      bonus_step: 80_000_000,
      bonus_step_amount: 1_000_000,
      bonus_cycle_multiplier: 2,
      bonus_cap_per_cycle: 30_000_000,
      note: "NVKD 250410 — mốc lũy kế 200tr, base tính HH = doanh thu / 1,1",
    },
    {
      role: "nvkd",
      effective_from: "2026-05-01",
      effective_to: "2026-06-30",
      cycle_months: 2,
      base_rate: 0.5,
      tiers: [{ threshold: 400_000_000, rate: 0.55 }],
      base_salary: 6_500_000,
      probation_salary: 5_200_000,
      apprentice_salary: 4_000_000,
      bonus_floor: 60_000_000,
      bonus_step: 80_000_000,
      bonus_step_amount: 1_000_000,
      bonus_cycle_multiplier: 2,
      bonus_cap_per_cycle: 30_000_000,
      note: "NVKD 260501 — mốc tăng 400tr, thêm lương học việc 4tr",
    },
    {
      role: "nvkd",
      effective_from: "2026-07-01",
      effective_to: null,
      cycle_months: 2,
      base_rate: 0.5,
      tiers: [{ threshold: 400_000_000, rate: 0.55 }],
      base_salary: 6_500_000,
      probation_salary: 5_200_000,
      apprentice_salary: 4_000_000,
      bonus_floor: 60_000_000,
      bonus_step: 100_000_000,
      bonus_step_amount: 1_000_000,
      bonus_cycle_multiplier: 2,
      bonus_cap_per_cycle: 30_000_000,
      note: "NVKD 260701 — step thưởng tăng lên 100tr; base HH = (doanh thu / 1,1) − phí admin",
    },
    // CTV
    {
      role: "ctv",
      effective_from: "2025-04-01",
      effective_to: null,
      cycle_months: 2,
      base_rate: 0.65,
      tiers: null,
      base_salary: 0,
      probation_salary: null,
      apprentice_salary: null,
      bonus_floor: null,
      bonus_step: null,
      bonus_step_amount: null,
      bonus_cycle_multiplier: null,
      bonus_cap_per_cycle: null,
      note: "CTV đối tác — flat 65%, không lương (văn bản 260701 ghi rõ; thực tế áp từ đầu, Excel trả 65% trước 07/2026)",
    },
    // TPKD (single policy)
    {
      role: "tpkd",
      effective_from: "2025-04-01",
      effective_to: null,
      cycle_months: 2,
      base_rate: 0,
      tiers: null,
      base_salary: 8_000_000,
      manager_probation_salary: 8_000_000,
      manager_bonus_tiers: [
        { threshold: 400_000_000, rate: 0.02 },
        { threshold: 800_000_000, rate: 0.03 },
        { threshold: 1_000_000_000, rate: 0.04 },
        { threshold: 1_500_000_000, rate: 0.05 },
      ],
      manager_salary_tiers: [
        { minSubs: 4, salary: 10_000_000 },
        { minSubs: 6, salary: 12_000_000 },
        { minSubs: 9, salary: 14_000_000 },
        { minSubs: 12, salary: 15_000_000 },
      ],
      note: "TPKD — tier HH quản lý theo doanh số phòng; tập sự (<4 NVKD) lương 8tr; KPI tối thiểu 400tr/kỳ để nhận lương chính thức. HH cá nhân theo policy NVKD.",
    },
    // Admin 2 giai đoạn
    {
      role: "admin",
      effective_from: "2025-04-01",
      effective_to: "2026-06-30",
      cycle_months: null,
      base_rate: 0.0025,
      tiers: null,
      base_salary: 8_000_000,
      probation_salary: 6_800_000, // 85% × 8tr
      note: "Admin 250401 — KPI quản lý rổ hàng 0.25%; sang nhượng 2tr/căn",
    },
    {
      role: "admin",
      effective_from: "2026-07-01",
      effective_to: null,
      cycle_months: null,
      base_rate: 0.005,
      tiers: null,
      base_salary: 8_000_000,
      probation_salary: 6_800_000,
      note: "Admin 260701 — KPI tăng lên 0.5%",
    },
  ];

  console.log("\n→ Seed 7 policy records");
  for (const p of policies) {
    await sql`
      INSERT INTO commission_policies (
        role, effective_from, effective_to, cycle_months,
        base_rate, tiers, base_salary, probation_salary, apprentice_salary,
        bonus_floor, bonus_step, bonus_step_amount, bonus_cycle_multiplier, bonus_cap_per_cycle,
        manager_bonus_tiers, manager_salary_tiers, manager_probation_salary,
        note
      ) VALUES (
        ${p.role}, ${p.effective_from}, ${p.effective_to}, ${p.cycle_months ?? 2},
        ${p.base_rate ?? null}, ${p.tiers ? sql.json(p.tiers) : null},
        ${p.base_salary ?? null}, ${p.probation_salary ?? null}, ${p.apprentice_salary ?? null},
        ${p.bonus_floor ?? null}, ${p.bonus_step ?? null}, ${p.bonus_step_amount ?? null},
        ${p.bonus_cycle_multiplier ?? null}, ${p.bonus_cap_per_cycle ?? null},
        ${p.manager_bonus_tiers ? sql.json(p.manager_bonus_tiers) : null},
        ${p.manager_salary_tiers ? sql.json(p.manager_salary_tiers) : null},
        ${p.manager_probation_salary ?? null},
        ${p.note ?? null}
      )
      ON CONFLICT (role, effective_from) DO UPDATE SET
        effective_to = EXCLUDED.effective_to,
        cycle_months = EXCLUDED.cycle_months,
        base_rate = EXCLUDED.base_rate,
        tiers = EXCLUDED.tiers,
        base_salary = EXCLUDED.base_salary,
        probation_salary = EXCLUDED.probation_salary,
        apprentice_salary = EXCLUDED.apprentice_salary,
        bonus_floor = EXCLUDED.bonus_floor,
        bonus_step = EXCLUDED.bonus_step,
        bonus_step_amount = EXCLUDED.bonus_step_amount,
        bonus_cycle_multiplier = EXCLUDED.bonus_cycle_multiplier,
        bonus_cap_per_cycle = EXCLUDED.bonus_cap_per_cycle,
        manager_bonus_tiers = EXCLUDED.manager_bonus_tiers,
        manager_salary_tiers = EXCLUDED.manager_salary_tiers,
        manager_probation_salary = EXCLUDED.manager_probation_salary,
        note = EXCLUDED.note
    `;
    console.log(`  ✓ ${p.role} · ${p.effective_from}${p.effective_to ? " → " + p.effective_to : " → nay"}`);
  }

  console.log("\n→ Verify:");
  const rows = await sql`
    SELECT role, effective_from, effective_to, base_rate,
           tiers, base_salary, note
    FROM commission_policies
    ORDER BY role, effective_from
  `;
  console.table(rows);
  await sql.end();
}
main();
