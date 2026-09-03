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
}

// Run schema on import so a fresh dev.db is always usable.
initSchema();
