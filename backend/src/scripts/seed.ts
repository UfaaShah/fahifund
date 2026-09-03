import dotenv from "dotenv";
dotenv.config();

import { db, initSchema } from "../lib/db";
import { hashPassword } from "../lib/auth";
import { newId } from "../lib/ids";
import { DEFAULT_PASSWORD } from "../lib/constants";

function wipe() {
  const tables = [
    "audit_logs",
    "notifications",
    "password_resets",
    "payouts",
    "payments",
    "fortune_orders",
    "fund_members",
    "bank_accounts",
    "funds",
    "users",
  ];
  for (const t of tables) db.prepare(`DELETE FROM ${t}`).run();
}

/**
 * Bootstraps a fresh database with a single, real Super Admin account —
 * no demo funds, members, or sample data. This is what runs automatically
 * on first boot of a real deployment (see seedIfEmpty.ts) and on
 * `npm run seed` for local development.
 *
 * For the old, fully-populated 3-fund/10-member showcase dataset (used by
 * backend/test-workflow.sh's end-to-end smoke test), see seedShowcase.ts
 * / `npm run seed:showcase`.
 */
export async function seedDemoData() {
  initSchema();
  wipe();
  console.log("Bootstrapping Fahi Fund with a single Super Admin account...");

  const passwordHash = await hashPassword(DEFAULT_PASSWORD);
  const superAdminId = newId();
  db.prepare(
    `INSERT INTO users (id, member_code, name, email, phone, password_hash, role) VALUES (?, 'FF-0000', ?, ?, ?, ?, 'SUPER_ADMIN')`
  ).run(superAdminId, "Ufaa", null, "9994000", passwordHash);

  console.log("Bootstrap complete.\n");
  console.log("Super Admin account:");
  console.log("  Name     — Ufaa");
  console.log("  Login    — 9994000 (mobile number)");
  console.log("  Password — welcome123 (change this after logging in via Profile → Change Password)");
}

// Only auto-run when invoked directly as a CLI script (`npm run seed`), not
// when imported by seedIfEmpty.ts.
if (require.main === module) {
  seedDemoData()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
