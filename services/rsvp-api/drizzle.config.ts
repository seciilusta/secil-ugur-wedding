import { defineConfig } from "drizzle-kit";

/**
 * Used by `pnpm db:generate` to turn changes in `src/db/schema.ts` into SQL in
 * `migrations/`. Applying those migrations is `pnpm db:migrate`, which runs
 * inside the service and uses `DATABASE_PATH`.
 */
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./migrations",
  strict: true,
  verbose: true,
});
