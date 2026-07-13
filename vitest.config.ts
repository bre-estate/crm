import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    // Đọc .env.test.local trước (test DB), fallback .env.local (nếu chạy pure logic tests)
    setupFiles: ["./tests/setup.ts"],
    // Test files ở tests/
    include: ["tests/**/*.test.ts"],
    // Serial cho CRUD tests đụng DB (tránh race). Pure logic tests parallel OK.
    // Vitest cho phép per-file config, mặc định để serial cho an toàn.
    fileParallelism: false,
    testTimeout: 30000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
