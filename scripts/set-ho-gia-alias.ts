/**
 * Set: Hồ Gia = alias của Hồ Nguyễn Công Thành + leader phòng Hồ Gia.
 * Idempotent — chạy nhiều lần OK.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../lib/schema";
import { eq, ilike } from "drizzle-orm";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const client = postgres(process.env.DATABASE_URL!, { prepare: false });
const db = drizzle(client, { schema });

async function main() {
  // 1. Tìm owner "Hồ Nguyễn Công Thành"
  const owners = await db
    .select()
    .from(schema.employees)
    .where(ilike(schema.employees.name, "Hồ Nguyễn Công Thành"));
  if (owners.length === 0) {
    console.error('Không tìm thấy employee "Hồ Nguyễn Công Thành". Có thể tên khác (dấu, khoảng trắng)?');
    console.error("Danh sách tên có 'Hồ Nguyễn' hoặc 'Công Thành':");
    const like = await db
      .select({ id: schema.employees.id, name: schema.employees.name })
      .from(schema.employees)
      .where(ilike(schema.employees.name, "%Công Thành%"));
    like.forEach((e) => console.error(`  #${e.id} ${e.name}`));
    process.exit(1);
  }
  const owner = owners[0];
  console.log(`Owner: #${owner.id} "${owner.name}" (position=${owner.position}, aliasOfId=${owner.aliasOfId})`);

  // 2. Tìm/tạo alias "Hồ Gia"
  const aliases = await db
    .select()
    .from(schema.employees)
    .where(ilike(schema.employees.name, "Hồ Gia"));
  let alias;
  if (aliases.length === 0) {
    const [inserted] = await db
      .insert(schema.employees)
      .values({
        name: "Hồ Gia",
        position: owner.position,
        departmentId: owner.departmentId,
        aliasOfId: owner.id,
        active: true,
        note: "Alias/tên gọi của Hồ Nguyễn Công Thành",
      })
      .returning();
    alias = inserted;
    console.log(`Tạo alias mới: #${alias.id} "Hồ Gia" → owner #${owner.id}`);
  } else {
    alias = aliases[0];
    if (alias.aliasOfId === owner.id) {
      console.log(`Alias đã đúng: #${alias.id} "Hồ Gia" → owner #${owner.id}. Không đổi.`);
    } else {
      await db
        .update(schema.employees)
        .set({ aliasOfId: owner.id, active: true })
        .where(eq(schema.employees.id, alias.id));
      console.log(`Update alias: #${alias.id} "Hồ Gia" → aliasOfId=${owner.id} (trước: ${alias.aliasOfId})`);
    }
  }

  // 3. Tìm/tạo phòng "Hồ Gia" + set leaderName
  const depts = await db
    .select()
    .from(schema.departments)
    .where(ilike(schema.departments.name, "%Hồ Gia%"));
  if (depts.length === 0) {
    console.log('Không có phòng "Hồ Gia" — bỏ qua bước set leader. Tạo phòng qua UI /departments.');
  } else {
    const dept = depts[0];
    if (dept.leaderName === owner.name) {
      console.log(`Phòng "${dept.name}" đã có leader = "${owner.name}". Không đổi.`);
    } else {
      await db
        .update(schema.departments)
        .set({ leaderName: owner.name })
        .where(eq(schema.departments.id, dept.id));
      console.log(`Update leader phòng "${dept.name}": "${dept.leaderName}" → "${owner.name}"`);
    }

    // Attach owner (và alias) vào phòng này nếu chưa
    if (owner.departmentId !== dept.id) {
      await db
        .update(schema.employees)
        .set({ departmentId: dept.id })
        .where(eq(schema.employees.id, owner.id));
      console.log(`Attach owner #${owner.id} vào phòng #${dept.id}`);
    }
    if (alias.departmentId !== dept.id) {
      await db
        .update(schema.employees)
        .set({ departmentId: dept.id })
        .where(eq(schema.employees.id, alias.id));
      console.log(`Attach alias #${alias.id} vào phòng #${dept.id}`);
    }
  }

  console.log("Xong.");
}

main()
  .then(() => client.end())
  .catch(async (err) => {
    console.error("Lỗi:", err);
    await client.end();
    process.exit(1);
  });
