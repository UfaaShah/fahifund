export type Role = "SUPER_ADMIN" | "ADMIN" | "USER";

export interface AuthUser {
  id: string;
  memberCode: string;
  name: string;
  email: string | null;
  phone: string;
  role: Role;
  photoUrl: string | null;
}

export interface FundBeneficiary {
  id: string;
  name: string;
  memberCode: string;
  photoUrl: string | null;
  bankAccount?: { bankName: string; accountName: string; accountNumber: string; branch: string | null } | null;
}

export type MonthStatus =
  | "UPCOMING"
  | "CONTRIBUTION_OPEN"
  | "PARTIALLY_COLLECTED"
  | "FULLY_COLLECTED"
  | "READY_FOR_PAYOUT"
  | "PAYOUT_PROCESSING"
  | "COMPLETED";

export interface Payment {
  id: string;
  fund_id: string;
  month_number: number;
  member_id: string;
  amount: number;
  payment_date: string | null;
  status: "PENDING" | "SENT" | "CONFIRMED" | "REJECTED";
  receipt_path: string | null;
  reference_number: string | null;
  note: string | null;
  verified_by_id: string | null;
  verified_at: string | null;
  name?: string;
  member_code?: string;
  photo_url?: string | null;
}

export interface Payout {
  id: string;
  fund_id: string;
  month_number: number;
  beneficiary_id: string;
  amount: number;
  payout_date: string | null;
  reference_number: string | null;
  receipt_path: string | null;
  status: "WAITING_COLLECTION" | "READY" | "PROCESSING" | "COMPLETED";
  completed_by_id: string | null;
  completed_at: string | null;
  beneficiary_name?: string;
  beneficiary_code?: string;
}

export interface MonthSummary {
  monthNumber: number;
  status: MonthStatus;
  contributionAmount: number;
  expectedMembers: number;
  expectedTotal: number;
  receivedTotal: number;
  paidCount: number;
  pendingCount: number;
  beneficiary: FundBeneficiary | null;
  payments: Payment[];
  payout: Payout | null;
}

export interface FundCore {
  id: string;
  name: string;
  description: string | null;
  contributionAmount: number;
  currency: string;
  startDate: string;
  durationMonths: number;
  adminId: string | null;
  createdById: string;
  status: "DRAFT" | "FORTUNE_PENDING" | "ACTIVE" | "COMPLETED" | "CANCELLED";
  fortuneLockedAt: string | null;
  createdAt: string;
}

export interface FundOverview {
  fund: FundCore;
  memberCount: number;
  currentMonth: number | null;
  monthsCompleted: number;
  isCompleted: boolean;
  currentBeneficiary: FundBeneficiary | null;
  admin: { id: string; name: string; memberCode: string; photoUrl: string | null } | null;
  adminBankAccount: { bankName: string; accountName: string; accountNumber: string; branch: string | null } | null;
  currentMonthSummary: MonthSummary | null;
}

export interface FundMemberRow {
  id: string;
  fund_id: string;
  user_id: string;
  member_number: number;
  slots: number;
  status: string;
  joined_at: string;
  name: string;
  email: string | null;
  phone: string;
  member_code: string;
  photo_url: string | null;
}

export interface FortuneOrderRow {
  id: string;
  fund_id: string;
  member_id: string;
  position: number;
  month_number: number;
  selected_at: string;
  locked_at: string | null;
  name: string;
  member_code: string;
  photo_url: string | null;
}

export interface FundDetail extends FundOverview {
  viewerRole: "SUPER_ADMIN" | "ADMIN" | "MEMBER";
  members: FundMemberRow[];
  fortuneOrder: FortuneOrderRow[];
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  createdAt: string;
}

export interface FortuneSwapRequest {
  id: string;
  fund_id: string;
  requested_by_id: string;
  member_a_id: string;
  member_b_id: string;
  reason: string | null;
  status: "PENDING" | "READY_FOR_FINAL_APPROVAL" | "APPROVED" | "REJECTED";
  member_a_approved_at: string | null;
  member_b_approved_at: string | null;
  final_approved_by_id: string | null;
  final_approved_at: string | null;
  rejected_by_id: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  member_a_name: string;
  member_a_code: string;
  member_a_photo: string | null;
  member_b_name: string;
  member_b_code: string;
  member_b_photo: string | null;
  member_a_position: number | null;
  member_b_position: number | null;
  requested_by_name: string;
}

export interface AuditLogRow {
  id: string;
  action: string;
  description: string;
  userName: string | null;
  fundName: string | null;
  createdAt: string;
}
