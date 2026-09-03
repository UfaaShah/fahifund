import { db } from "./db";

export interface FundRow {
  id: string;
  name: string;
  description: string | null;
  contribution_amount: number;
  currency: string;
  start_date: string;
  duration_months: number;
  admin_id: string | null;
  created_by_id: string;
  status: string;
  fortune_locked_at: string | null;
  created_at: string;
}

export function getFund(fundId: string): FundRow | undefined {
  return db.prepare("SELECT * FROM funds WHERE id = ?").get(fundId) as FundRow | undefined;
}

export function getActiveFundMembers(fundId: string) {
  return db
    .prepare(
      `SELECT fm.*, u.name, u.email, u.phone, u.member_code, u.photo_url
       FROM fund_members fm JOIN users u ON u.id = fm.user_id
       WHERE fm.fund_id = ? AND fm.status = 'ACTIVE'
       ORDER BY fm.member_number ASC`
    )
    .all(fundId) as any[];
}

export function getFortuneOrder(fundId: string) {
  return db
    .prepare(
      `SELECT fo.*, u.name, u.member_code, u.photo_url
       FROM fortune_orders fo JOIN users u ON u.id = fo.member_id
       WHERE fo.fund_id = ?
       ORDER BY fo.position ASC`
    )
    .all(fundId) as any[];
}

/** First month number whose payout is not yet COMPLETED. If every month is
 * completed, returns durationMonths + 1 (fund fully finished). */
export function getCurrentMonthNumber(fundId: string): number {
  const fund = getFund(fundId);
  if (!fund) return 1;
  const completed = db
    .prepare(
      `SELECT month_number FROM payouts WHERE fund_id = ? AND status = 'COMPLETED'`
    )
    .all(fundId) as { month_number: number }[];
  const completedSet = new Set(completed.map((c) => c.month_number));
  for (let m = 1; m <= fund.duration_months; m++) {
    if (!completedSet.has(m)) return m;
  }
  return fund.duration_months + 1;
}

export interface MonthSummary {
  monthNumber: number;
  status:
    | "UPCOMING"
    | "CONTRIBUTION_OPEN"
    | "PARTIALLY_COLLECTED"
    | "FULLY_COLLECTED"
    | "READY_FOR_PAYOUT"
    | "PAYOUT_PROCESSING"
    | "COMPLETED";
  contributionAmount: number;
  expectedMembers: number;
  expectedTotal: number;
  receivedTotal: number;
  paidCount: number;
  pendingCount: number;
  beneficiary:
    | {
        id: string;
        name: string;
        memberCode: string;
        photoUrl: string | null;
        bankAccount: { bankName: string; accountName: string; accountNumber: string; branch: string | null } | null;
      }
    | null;
  payments: any[];
  payout: any | null;
}

export function getMonthSummary(fundId: string, monthNumber: number): MonthSummary {
  const fund = getFund(fundId)!;
  const members = getActiveFundMembers(fundId);
  const expectedMembers = members.length;
  const expectedTotal = expectedMembers * fund.contribution_amount;

  const payments = db
    .prepare(
      `SELECT p.*, u.name, u.member_code, u.photo_url
       FROM payments p JOIN users u ON u.id = p.member_id
       WHERE p.fund_id = ? AND p.month_number = ?
       ORDER BY u.name ASC`
    )
    .all(fundId, monthNumber) as any[];

  const confirmed = payments.filter((p) => p.status === "CONFIRMED");
  const receivedTotal = confirmed.reduce((sum, p) => sum + p.amount, 0);
  const paidCount = confirmed.length;
  const pendingCount = expectedMembers - paidCount;

  const fortuneRow = db
    .prepare(
      `SELECT fo.member_id as id, u.name, u.member_code, u.photo_url,
              ba.bank_name, ba.account_name, ba.account_number, ba.branch
       FROM fortune_orders fo
       JOIN users u ON u.id = fo.member_id
       LEFT JOIN bank_accounts ba ON ba.user_id = u.id
       WHERE fo.fund_id = ? AND fo.month_number = ?`
    )
    .get(fundId, monthNumber) as any;

  const payout = db
    .prepare(`SELECT * FROM payouts WHERE fund_id = ? AND month_number = ?`)
    .get(fundId, monthNumber) as any;

  const currentMonth = getCurrentMonthNumber(fundId);

  let status: MonthSummary["status"];
  if (payout && payout.status === "COMPLETED") {
    status = "COMPLETED";
  } else if (payout && payout.status === "PROCESSING") {
    status = "PAYOUT_PROCESSING";
  } else if (expectedMembers > 0 && paidCount >= expectedMembers) {
    status = payout && payout.status === "READY" ? "READY_FOR_PAYOUT" : "FULLY_COLLECTED";
  } else if (paidCount > 0) {
    status = "PARTIALLY_COLLECTED";
  } else if (monthNumber === currentMonth) {
    status = "CONTRIBUTION_OPEN";
  } else if (monthNumber < currentMonth) {
    // shouldn't normally happen since currentMonth only advances after payout completion,
    // but guard for data consistency
    status = "PARTIALLY_COLLECTED";
  } else {
    status = "UPCOMING";
  }

  return {
    monthNumber,
    status,
    contributionAmount: fund.contribution_amount,
    expectedMembers,
    expectedTotal,
    receivedTotal,
    paidCount,
    pendingCount,
    beneficiary: fortuneRow
      ? {
          id: fortuneRow.id,
          name: fortuneRow.name,
          memberCode: fortuneRow.member_code,
          photoUrl: fortuneRow.photo_url,
          bankAccount: fortuneRow.bank_name
            ? {
                bankName: fortuneRow.bank_name,
                accountName: fortuneRow.account_name,
                accountNumber: fortuneRow.account_number,
                branch: fortuneRow.branch,
              }
            : null,
        }
      : null,
    payments,
    payout: payout || null,
  };
}

export function getFundTimeline(fundId: string): MonthSummary[] {
  const fund = getFund(fundId)!;
  const out: MonthSummary[] = [];
  for (let m = 1; m <= fund.duration_months; m++) {
    out.push(getMonthSummary(fundId, m));
  }
  return out;
}
