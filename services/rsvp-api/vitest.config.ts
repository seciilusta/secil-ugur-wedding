import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // Each file opens its own temporary SQLite file; no shared global state.
    pool: "threads",
    restoreMocks: true,
  },
});
