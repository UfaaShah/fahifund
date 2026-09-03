import { db } from "../lib/db";
import { seedDemoData } from "./seed";

/**
 * Safe to call on every server boot: seeds demo data only the very first
 * time (empty database — e.g. a fresh Render persistent disk), and does
 * nothing on every subsequent restart so real data is never wiped.
 *
 * This is intentionally NOT the same as `npm run seed`, which always wipes
 * and reseeds — that one is for local development resets only and must
 * never run automatically against a deployed database.
 */
export async function seedIfEmpty() {
  const row = db.prepare("SELECT COUNT(*) as c FROM users").get() as { c: number };
  if (row.c > 0) {
    console.log(`Database already has ${row.c} user(s) — skipping demo seed.`);
    return;
  }
  console.log("Database is empty — loading demo data for first boot...");
  await seedDemoData();
}
