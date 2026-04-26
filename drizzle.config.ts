import type { Config } from "drizzle-kit";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

export default {
  schema: "./lib/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // For `drizzle-kit push` or `drizzle-kit studio` — may be empty when only running `generate`.
    url: process.env.DATABASE_URL ?? "postgresql://placeholder",
  },
} satisfies Config;
