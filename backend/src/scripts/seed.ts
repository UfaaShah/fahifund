import dotenv from "dotenv";
dotenv.config();

import { db, initSchema } from "../lib/db";
import { hashPassword } from "../lib/auth";
import { newId } from "../lib/ids";

const DEMO_PASSWORD = "Demo@1234";

const MEMBER_NAMES = [
  "Ahmed Shah",
  "Ali Waheed",
  "Hassan Ibrahim",
  "Ibrahim Adam",
  "Mohamed Zuhair",
  "Fathimath Nisha",
  "Aminath Shifa",
  "Hussain Yoosuf",
  "Abdulla Rasheed",
  "Mariyam Nazima",
];

const BANKS = ["Bank of Maldives", "Maldives Islamic Bank", "State Bank of India (Male')"];

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

export async function seedDemoData() {
  initSchema();
  wipe();
  console.log("Seeding Fahi Fund demo data...");

  const passwordHash = await hashPassword(DEMO_PASSWORD);

  // --- Super Admin ---
  const superAdminId = newId();
  db.prepare(
    `INSERT INTO users (id, member_code, name, email, phone, password_hash, role) VALUES (?, 'FF-0000', ?, ?, ?, ?, 'SUPER_ADMIN')`
  ).run(superAdminId, "Aishath Waheeda", "superadmin@fahifund.test", "+9607700001", passwordHash);

  // --- 10 base members (member #1, Ahmed Shah, will be promoted to ADMIN of Fund A) ---
  const memberIds: string[] = [];
  MEMBER_NAMES.forEach((name, idx) => {
    const id = newId();
    memberIds.push(id);
    const slug = name.toLowerCase().replace(/[^a-z]+/g, ".").replace(/^\.|\.$/g, "");
    db.prepare(
      `INSERT INTO users (id, member_code, name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?, ?, 'USER')`
    ).run(id, `FF-${String(idx + 1).padStart(4, "0")}`, name, `${slug}@fahifund.test`, `+96077000${String(idx + 2).padStart(2, "0")}`, passwordHash);

    db.prepare(
      `INSERT INTO bank_accounts (id, user_id, bank_name, account_name, account_number, branch) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(newId(), id, BANKS[idx % BANKS.length], name, `77${String(1000000 + idx * 137).slice(-8)}`, "Male' Branch");
  });
  const [ahmed, ali, hassan, ibrahim, mohamed, fathimath, aminath, hussain, abdulla, mariyam] = memberIds;

  db.prepare("UPDATE users SET role = 'ADMIN' WHERE id = ?").run(ahmed);
  db.prepare("UPDATE users SET role = 'ADMIN' WHERE id = ?").run(ali); // also collects for Fund B below

  function addFundMember(fundId: string, userId: string, memberNumber: number) {
    db.prepare(
      `INSERT INTO fund_members (id, fund_id, user_id, member_number) VALUES (?, ?, ?, ?)`
    ).run(newId(), fundId, userId, memberNumber);
  }

  function lockFortuneOrder(fundId: string, orderedUserIds: string[]) {
    const now = new Date().toISOString();
    orderedUserIds.forEach((userId, idx) => {
      db.prepare(
        `INSERT INTO fortune_orders (id, fund_id, member_id, position, month_number, locked_at) VALUES (?, ?, ?, ?, ?, ?)`
      ).run(newId(), fundId, userId, idx + 1, idx + 1, now);
    });
    db.prepare(`UPDATE funds SET fortune_locked_at = ?, status = 'ACTIVE' WHERE id = ?`).run(now, fundId);
  }

  function audit(userId: string | null, fundId: string | null, action: string, description: string, when?: string) {
    db.prepare(
      `INSERT INTO audit_logs (id, user_id, fund_id, action, description, created_at) VALUES (?, ?, ?, ?, ?, COALESCE(?, strftime('%Y-%m-%dT%H:%M:%fZ','now')))`
    ).run(newId(), userId, fundId, action, description, when ?? null);
  }

  function notify(userId: string, title: string, message: string, type = "INFO") {
    db.prepare(`INSERT INTO notifications (id, user_id, title, message, type) VALUES (?, ?, ?, ?, ?)`).run(
      newId(),
      userId,
      title,
      message,
      type
    );
  }

  // =========================================================================
  // FUND A — "Fahi Fund - Demo 2026" — the primary, fully-populated demo fund.
  // 10 members, MVR 1,000/month, 10 months, started 1 Jul 2026.
  // Month 1 (Jul) and Month 2 (Aug) are fully completed with payouts sent.
  // Month 3 (Sep, "today") is in progress: 8 confirmed, 1 awaiting
  // verification, 1 not yet submitted — mirrors the spec's dashboard example
  // and leaves real work for a live end-to-end test of the running app.
  // =========================================================================
  const fundAId = newId();
  db.prepare(
    `INSERT INTO funds (id, name, description, contribution_amount, currency, start_date, duration_months, admin_id, created_by_id, status)
     VALUES (?, ?, ?, 1000, 'MVR', '2026-07-01T00:00:00.000Z', 10, ?, ?, 'DRAFT')`
  ).run(fundAId, "Fahi Fund - Demo 2026", "The main rotating savings group for the Cowork demo.", ahmed, superAdminId);
  memberIds.forEach((id, idx) => addFundMember(fundAId, id, idx + 1));
  audit(superAdminId, fundAId, "CREATE_FUND", 'Super Admin created fund "Fahi Fund - Demo 2026"', "2026-06-20T09:00:00.000Z");
  memberIds.forEach((id) => audit(superAdminId, fundAId, "ADD_FUND_MEMBER", `Super Admin added a member to "Fahi Fund - Demo 2026"`, "2026-06-20T09:05:00.000Z"));
  audit(superAdminId, fundAId, "ASSIGN_ADMIN", "Super Admin assigned Ahmed Shah as the collecting Admin", "2026-06-20T09:10:00.000Z");
  audit(superAdminId, fundAId, "FORTUNE_WHEEL_SPIN", "Super Admin ran the Fortune Wheel for \"Fahi Fund - Demo 2026\" (10 members)", "2026-06-25T14:00:00.000Z");
  lockFortuneOrder(fundAId, memberIds); // position 1..10 == member order for a predictable demo
  audit(superAdminId, fundAId, "LOCK_FORTUNE_ORDER", "Fortune Wheel order finalized and locked for \"Fahi Fund - Demo 2026\"", "2026-06-25T14:05:00.000Z");

  function seedCompletedMonth(fundId: string, monthNumber: number, beneficiaryId: string, payoutRef: string, dateStr: string) {
    for (const id of memberIds) {
      db.prepare(
        `INSERT INTO payments (id, fund_id, month_number, member_id, amount, payment_date, status, reference_number, verified_by_id, verified_at)
         VALUES (?, ?, ?, ?, 1000, ?, 'CONFIRMED', ?, ?, ?)`
      ).run(newId(), fundId, monthNumber, id, `${dateStr}T09:00:00.000Z`, `PMT-${monthNumber}-${id.slice(0, 4)}`, ahmed, `${dateStr}T18:00:00.000Z`);
    }
    db.prepare(
      `INSERT INTO payouts (id, fund_id, month_number, beneficiary_id, amount, payout_date, reference_number, status, completed_by_id, completed_at)
       VALUES (?, ?, ?, ?, 10000, ?, ?, 'COMPLETED', ?, ?)`
    ).run(newId(), fundId, monthNumber, beneficiaryId, `${dateStr}T00:00:00.000Z`, payoutRef, ahmed, `${dateStr}T20:00:00.000Z`);
    audit(ahmed, fundId, "COMPLETE_PAYOUT", `Admin completed month ${monthNumber} payout of MVR 10000`, `${dateStr}T20:00:00.000Z`);
  }

  seedCompletedMonth(fundAId, 1, ahmed, "TXN-2026-07-0001", "2026-07-28");
  seedCompletedMonth(fundAId, 2, ali, "TXN-2026-08-0001", "2026-08-28");

  // Month 3 — in progress.
  const month3PaidOrder = [hassan, ibrahim, mohamed, fathimath, aminath, hussain, abdulla, mariyam]; // 8 confirmed
  month3PaidOrder.forEach((id) => {
    db.prepare(
      `INSERT INTO payments (id, fund_id, month_number, member_id, amount, payment_date, status, reference_number, verified_by_id, verified_at)
       VALUES (?, ?, 3, ?, 1000, '2026-08-30T10:00:00.000Z', 'CONFIRMED', ?, ?, '2026-08-30T16:00:00.000Z')`
    ).run(newId(), fundAId, id, `PMT-3-${id.slice(0, 4)}`, ahmed);
  });
  // Ahmed (the Admin) has submitted but not yet self-confirmed.
  db.prepare(
    `INSERT INTO payments (id, fund_id, month_number, member_id, amount, payment_date, status, reference_number)
     VALUES (?, ?, 3, ?, 1000, '2026-08-31T08:00:00.000Z', 'SENT', ?)`
  ).run(newId(), fundAId, ahmed, "PMT-3-pending");
  // Ali has not submitted month 3 yet at all.

  notify(ali, "Contribution reminder", "Your month 3 contribution of MVR 1,000 for \"Fahi Fund - Demo 2026\" is due.", "REMINDER");
  notify(ahmed, "Payment pending", "Your month 3 contribution is still waiting for your own confirmation as Admin.", "WARNING");
  notify(hassan, "Payment received", "Your month 3 payment has been confirmed by the Admin.", "SUCCESS");
  notify(ali, "Payout completed", "Month 2's fund of MVR 10,000 has been paid to you.", "SUCCESS");

  // =========================================================================
  // FUND B — "Fahi Fund - Family Circle" — smaller fund, fully collected and
  // sitting at READY_FOR_PAYOUT so the payout flow can be tested live.
  // =========================================================================
  const fundBMembers = [ahmed, ali, hassan, ibrahim, mohamed];
  const fundBId = newId();
  db.prepare(
    `INSERT INTO funds (id, name, description, contribution_amount, currency, start_date, duration_months, admin_id, created_by_id, status)
     VALUES (?, ?, ?, 2000, 'MVR', '2026-08-01T00:00:00.000Z', 5, ?, ?, 'DRAFT')`
  ).run(fundBId, "Fahi Fund - Family Circle", "A small family savings circle.", ali, superAdminId);
  fundBMembers.forEach((id, idx) => addFundMember(fundBId, id, idx + 1));
  audit(superAdminId, fundBId, "CREATE_FUND", 'Super Admin created fund "Fahi Fund - Family Circle"', "2026-07-15T09:00:00.000Z");
  audit(superAdminId, fundBId, "FORTUNE_WHEEL_SPIN", "Super Admin ran the Fortune Wheel for \"Fahi Fund - Family Circle\" (5 members)", "2026-07-16T09:00:00.000Z");
  lockFortuneOrder(fundBId, [hassan, ahmed, mohamed, ali, ibrahim]);
  audit(superAdminId, fundBId, "LOCK_FORTUNE_ORDER", "Fortune Wheel order finalized and locked for \"Fahi Fund - Family Circle\"", "2026-07-16T09:05:00.000Z");

  fundBMembers.forEach((id) => {
    db.prepare(
      `INSERT INTO payments (id, fund_id, month_number, member_id, amount, payment_date, status, reference_number, verified_by_id, verified_at)
       VALUES (?, ?, 1, ?, 2000, '2026-08-05T09:00:00.000Z', 'CONFIRMED', ?, ?, '2026-08-06T09:00:00.000Z')`
    ).run(newId(), fundBId, id, `PMT-B1-${id.slice(0, 4)}`, ali);
  });
  db.prepare(
    `INSERT INTO payouts (id, fund_id, month_number, beneficiary_id, amount, status) VALUES (?, ?, 1, ?, 10000, 'READY')`
  ).run(newId(), fundBId, hassan);
  audit(null, fundBId, "COLLECTION_COMPLETE", "Month 1 collection complete for \"Fahi Fund - Family Circle\" — ready for payout", "2026-08-06T09:05:00.000Z");
  notify(ali, "Collection complete", "Month 1 is fully collected for \"Fahi Fund - Family Circle\". Ready to pay out to Hassan Ibrahim.", "PAYOUT");
  notify(hassan, "Your payout is ready", "Month 1 collection is complete. Your payout will be sent shortly.", "PAYOUT");

  // =========================================================================
  // FUND C — "Fahi Fund - Office Group" — pre-launch: members added, Fortune
  // Wheel not yet run. Lets the live Fortune Wheel spin/lock UI be exercised.
  // =========================================================================
  const fundCMembers = [aminath, hussain, abdulla, mariyam, ahmed, ali];
  const fundCId = newId();
  db.prepare(
    `INSERT INTO funds (id, name, description, contribution_amount, currency, start_date, duration_months, created_by_id, status)
     VALUES (?, ?, ?, 1500, 'MVR', '2026-09-15T00:00:00.000Z', 6, ?, 'DRAFT')`
  ).run(fundCId, "Fahi Fund - Office Group", "Colleagues saving together, launching soon.", superAdminId);
  fundCMembers.forEach((id, idx) => addFundMember(fundCId, id, idx + 1));
  audit(superAdminId, fundCId, "CREATE_FUND", 'Super Admin created fund "Fahi Fund - Office Group"', "2026-08-25T09:00:00.000Z");
  db.prepare(`UPDATE funds SET status='FORTUNE_PENDING' WHERE id=?`).run(fundCId);

  console.log("Seed complete.\n");
  console.log("Demo accounts (password for all: Demo@1234):");
  console.log("  Super Admin — superadmin@fahifund.test");
  console.log("  Admin       — ahmed.shah@fahifund.test  (collects for Fahi Fund - Demo 2026)");
  console.log("  Member      — ali.waheed@fahifund.test  (#2 in the Fortune order, received month 2's payout)");
  console.log("  Member      — hassan.ibrahim@fahifund.test (next in line, month 3 of 10)");
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
