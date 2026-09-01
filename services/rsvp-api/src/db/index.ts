import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema.js";

export type Db = ReturnType<typeof drizzle<typeof schema>>;

export interface DatabaseHandle {
  db: Db;
  /** Kept so the connection can be closed cleanly on shutdown. */
  connection: Database.Database;
  close: () => void;
}

/** Migration SQL lives next to the source, so it ships with the service. */
export const MIGRATIONS_FOLDER = path.resolve(import.meta.dirname, "../../migrations");

/**
 * Opens (or creates) the SQLite database at `databasePath`.
 *
 * An existing file is opened as-is and never truncated or replaced. The parent
 * directory is created if it is missing, which is what makes a bare
 * `DATABASE_PATH=/data/rsvp.sqlite` work on a fresh container volume.
 */
export function openDatabase(databasePath: string): DatabaseHandle {
  const resolved = path.resolve(databasePath);
  mkdirSync(path.dirname(resolved), { recursive: true });

  const connection = new Database(resolved);

  // WAL lets readers (the CSV export) run while a write is in progress and
  // survives an unclean shutdown better than the default rollback journal.
  connection.pragma("journal_mode = WAL");
  connection.pragma("synchronous = NORMAL");
  connection.pragma("foreign_keys = ON");
  // Wait rather than fail if another process holds the write lock.
  connection.pragma("busy_timeout = 5000");

  const db = drizzle(connection, { schema });

  return {
    db,
    connection,
    close: () => {
      if (connection.open) {
        // Fold the WAL back into the main file so a copy of the .sqlite file
        // alone is a complete backup.
        connection.pragma("wal_checkpoint(TRUNCATE)");
        connection.close();
      }
    },
  };
}

/**
 * Applies any migrations the database has not seen yet.
 *
 * Idempotent: Drizzle records applied migrations in its own bookkeeping table,
 * so running this on an existing database leaves the data untouched.
 */
export function runMigrations(db: Db): void {
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}
