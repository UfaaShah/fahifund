import path from "path";
import fs from "fs";
import Database from "better-sqlite3";
import { newId } from "./ids";

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
  reconcileFundAdmins();
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

// Fix-up for a real bug (not a schema change, so safe/cheap to just re-check every boot):
// picking an "Assigned Admin" on the Create Fund form set funds.admin_id directly but never
// made that person an active fund_member or promoted their login from USER to ADMIN — both of
// which the later /:id/admin reassignment route always did. Without them, that fund never
// showed up in the admin's own `GET /funds` (queried by fund_members, not admin_id) or their
// bottom nav (still the USER set), so they had no way to reach Collection/Payout at all, even
// though direct fund-scoped routes already recognized them correctly via admin_id. This
// reconciles any fund created before the fix (and is a no-op for everything created after it).
function reconcileFundAdmins() {
  const funds = db
    .prepare("SELECT id, name, admin_id FROM funds WHERE admin_id IS NOT NULL")
    .all() as { id: string; name: string; admin_id: string }[];
  for (const fund of funds) {
    const membership = db
      .prepare("SELECT id, status FROM fund_members WHERE fund_id = ? AND user_id = ?")
      .get(fund.id, fund.admin_id) as { id: string; status: string } | undefined;
    if (!membership) {
      const maxRow = db.prepare("SELECT MAX(member_number) as m FROM fund_members WHERE fund_id = ?").get(fund.id) as
        | { m: number | null }
        | undefined;
      const memberNumber = (maxRow?.m || 0) + 1;
      db.prepare(
        `INSERT INTO fund_members (id, fund_id, user_id, member_number, slots) VALUES (?, ?, ?, ?, 1)`
      ).run(newId(), fund.id, fund.admin_id, memberNumber);
      console.log(`Reconciled: added "${fund.name}"'s assigned Admin as an active fund member.`);
    } else if (membership.status !== "ACTIVE") {
      db.prepare("UPDATE fund_members SET status = 'ACTIVE' WHERE id = ?").run(membership.id);
      console.log(`Reconciled: reactivated "${fund.name}"'s assigned Admin's membership.`);
    }
    const promoted = db
      .prepare("UPDATE users SET role = 'ADMIN' WHERE id = ? AND role = 'USER'")
      .run(fund.admin_id);
    if (promoted.changes > 0) {
      console.log(`Reconciled: promoted "${fund.name}"'s assigned Admin from USER to ADMIN.`);
    }
  }
}

// Run schema on import so a fresh dev.db is always usable.
initSchema();
