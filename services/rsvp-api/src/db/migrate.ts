import { loadConfig } from "../config/env.js";
import { MIGRATIONS_FOLDER, openDatabase, runMigrations } from "./index.js";

/**
 * Standalone migration runner: `pnpm db:migrate`.
 *
 * Safe to run repeatedly and safe to run against a database that already holds
 * responses — Drizzle only applies migrations the database has not recorded yet.
 */

try {
  process.loadEnvFile();
} catch {
  // No .env file, which is fine.
}

const config = loadConfig();
const handle = openDatabase(config.databasePath);

try {
  runMigrations(handle.db);
  console.log(`Migrations applied.`);
  console.log(`  database:   ${config.databasePath}`);
  console.log(`  migrations: ${MIGRATIONS_FOLDER}`);
} finally {
  handle.close();
}
