import path from "path";
import fs from "fs";
import Database from "better-sqlite3";

const dbPath = path.resolve(__dirname, "../../", process.env.DATABASE_PATH || "./dev.db");

export const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

export function initSchema() {
  const schemaPath = path.resolve(__dirname, "./schema.sql");
  const sql = fs.readFileSync(schemaPath, "utf-8");
  db.exec(sql);
  migrateEmailNullable();
}

// One-off migration for databases created before email became optional on the users table
// (`CREATE TABLE IF NOT EXISTS` above is a no-op against an existing table, so an
// already-deployed database needs this to actually drop the old NOT NULL constraint).
// SQLite has no ALTER COLUMN, so this rebuilds the table. Safe to run on every boot: it
// checks the live column definition first and does nothing once already migrated.
function migrateEmailNullable() {
  const columns = db.prepare("PRAGMA table_info(users)").all() as { name: string; notnull: number }[];
  const emailColumn = columns.find((c) => c.name === "email");
  if (!emailColumn || emailColumn.notnull !== 1) return;

  console.log("Migrating users.email to be optional (allowing members without an email)...");
  db.pragma("foreign_keys = OFF");
  try {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE users_new (
          id            TEXT PRIMARY KEY,
          member_code   TEXT UNIQUE NOT NULL,
          name          TEXT NOT NULL,
          email         TEXT UNIQUE,
          phone         TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          role          TEXT NOT NULL DEFAULT 'USER',
          status        TEXT NOT NULL DEFAULT 'ACTIVE',
          photo_url     TEXT,
          national_id   TEXT,
          created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        );
        INSERT INTO users_new (id, member_code, name, email, phone, password_hash, role, status, photo_url, national_id, created_at)
          SELECT id, member_code, name, email, phone, password_hash, role, status, photo_url, national_id, created_at FROM users;
        DROP TABLE users;
        ALTER TABLE users_new RENAME TO users;
      `);
    })();
  } finally {
    db.pragma("foreign_keys = ON");
  }
  console.log("Migration complete: users.email is now optional.");
}

// Run schema on import so a fresh dev.db is always usable.
initSchema();
