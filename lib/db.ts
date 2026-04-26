import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL chưa được set. Copy .env.example thành .env.local và điền thông tin Supabase.",
  );
}

// Postgres-js connection — pooled mode through Supabase pooler.
const client = postgres(connectionString, {
  prepare: false, // required for Supabase transaction pooler
});

export const db = drizzle(client, { schema });
export { schema };
