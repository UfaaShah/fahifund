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
  migrateFundMembersSlots();
  migrateFortuneOrdersMultiSlot();
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

// One-off migration for databases created before a member could hold more than
// one "slot" (share) of a fund. Adding a NOT NULL column with a constant
// DEFAULT is one of the few ALTER TABLE forms SQLite supports directly, so no
// table rebuild is needed here — existing rows all become slots = 1.
function migrateFundMembersSlots() {
  const columns = db.prepare("PRAGMA table_info(fund_members)").all() as { name: string }[];
  if (columns.some((c) => c.name === "slots")) return;

  console.log("Migrating fund_members to support multiple slots per member...");
  db.exec("ALTER TABLE fund_members ADD COLUMN slots INTEGER NOT NULL DEFAULT 1");
  console.log("Migration complete: fund_members.slots added (existing members default to 1).");
}

// One-off migration for databases created before a member could hold more than
// one slot: fortune_orders used to have UNIQUE(fund_id, member_id), which
// blocks a multi-slot member from occupying more than one position. SQLite
// can't drop a table constraint with ALTER TABLE, so this rebuilds the table
// (as migrateEmailNullable() does for users) — safe to run on every boot, it
// checks the live table definition first and is a no-op once migrated.
function migrateFortuneOrdersMultiSlot() {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='fortune_orders'").get() as
    | { sql: string }
    | undefined;
  if (!row || !row.sql.includes("UNIQUE(fund_id, member_id)")) return;

  console.log("Migrating fortune_orders to allow multiple positions per member (multi-slot support)...");
  db.pragma("foreign_keys = OFF");
  try {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE fortune_orders_new (
          id           TEXT PRIMARY KEY,
          fund_id      TEXT NOT NULL REFERENCES funds(id),
          member_id    TEXT NOT NULL REFERENCES users(id),
          position     INTEGER NOT NULL,
          month_number INTEGER NOT NULL,
          selected_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
          locked_at    TEXT,
          UNIQUE(fund_id, position)
        );
        INSERT INTO fortune_orders_new (id, fund_id, member_id, position, month_number, selected_at, locked_at)
          SELECT id, fund_id, member_id, position, month_number, selected_at, locked_at FROM fortune_orders;
        DROP TABLE fortune_orders;
        ALTER TABLE fortune_orders_new RENAME TO fortune_orders;
      `);
    })();
  } finally {
    db.pragma("foreign_keys = ON");
  }
  console.log("Migration complete: fortune_orders now supports multiple positions per member.");
}

// Run schema on import so a fresh dev.db is always usable.
initSchema();
