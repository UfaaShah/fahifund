-- Fahi Fund database schema (SQLite for dev/demo).
-- Column shapes are kept portable to MySQL: TEXT ids (UUID/cuid-style),
-- ISO-8601 datetime strings, REAL for money, INTEGER 0/1 for booleans.
-- Swapping the driver + these types (VARCHAR/DATETIME/DECIMAL) is all
-- that's needed to run the same shape on MySQL in production.

PRAGMA foreign_keys = ON;

-- role: SUPER_ADMIN | ADMIN | USER
-- status: ACTIVE | SUSPENDED
CREATE TABLE IF NOT EXISTS users (
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

-- status: ACTIVE | INACTIVE
CREATE TABLE IF NOT EXISTS bank_accounts (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id),
  bank_name      TEXT NOT NULL,
  account_name   TEXT NOT NULL,
  account_number TEXT NOT NULL,
  branch         TEXT,
  status         TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- status: DRAFT | FORTUNE_PENDING | ACTIVE | COMPLETED | CANCELLED
CREATE TABLE IF NOT EXISTS funds (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  description         TEXT,
  contribution_amount REAL NOT NULL,
  currency            TEXT NOT NULL DEFAULT 'MVR',
  start_date          TEXT NOT NULL,
  duration_months     INTEGER NOT NULL,
  admin_id            TEXT REFERENCES users(id),
  created_by_id       TEXT NOT NULL REFERENCES users(id),
  status              TEXT NOT NULL DEFAULT 'DRAFT',
  fortune_locked_at   TEXT,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- status: ACTIVE | REMOVED
CREATE TABLE IF NOT EXISTS fund_members (
  id            TEXT PRIMARY KEY,
  fund_id       TEXT NOT NULL REFERENCES funds(id),
  user_id       TEXT NOT NULL REFERENCES users(id),
  member_number INTEGER NOT NULL,
  status        TEXT NOT NULL DEFAULT 'ACTIVE',
  joined_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(fund_id, user_id),
  UNIQUE(fund_id, member_number)
);

CREATE TABLE IF NOT EXISTS fortune_orders (
  id           TEXT PRIMARY KEY,
  fund_id      TEXT NOT NULL REFERENCES funds(id),
  member_id    TEXT NOT NULL REFERENCES users(id),
  position     INTEGER NOT NULL,
  month_number INTEGER NOT NULL,
  selected_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  locked_at    TEXT,
  UNIQUE(fund_id, member_id),
  UNIQUE(fund_id, position)
);

-- Requests to swap two members' positions in an already-locked Fortune order.
-- status: PENDING (waiting on the named member(s) to approve) |
--         READY_FOR_FINAL_APPROVAL (both members approved, waiting on Super Admin) |
--         APPROVED (Super Admin gave final approval — the swap has been executed) |
--         REJECTED (declined by a named member or Super Admin)
-- A requester who is one of the two named members is auto-approved on their own side.
-- Super Admin's final approval is always a separate, explicit action, even when
-- Super Admin was also the one who made the original request.
CREATE TABLE IF NOT EXISTS fortune_swap_requests (
  id                    TEXT PRIMARY KEY,
  fund_id               TEXT NOT NULL REFERENCES funds(id),
  requested_by_id       TEXT NOT NULL REFERENCES users(id),
  member_a_id           TEXT NOT NULL REFERENCES users(id),
  member_b_id           TEXT NOT NULL REFERENCES users(id),
  reason                TEXT,
  status                TEXT NOT NULL DEFAULT 'PENDING',
  member_a_approved_at  TEXT,
  member_b_approved_at  TEXT,
  final_approved_by_id  TEXT REFERENCES users(id),
  final_approved_at     TEXT,
  rejected_by_id        TEXT REFERENCES users(id),
  rejected_at           TEXT,
  rejection_reason      TEXT,
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- status: PENDING | SENT | CONFIRMED | REJECTED
CREATE TABLE IF NOT EXISTS payments (
  id                TEXT PRIMARY KEY,
  fund_id           TEXT NOT NULL REFERENCES funds(id),
  month_number      INTEGER NOT NULL,
  member_id         TEXT NOT NULL REFERENCES users(id),
  amount            REAL NOT NULL,
  payment_date      TEXT,
  status            TEXT NOT NULL DEFAULT 'PENDING',
  receipt_path      TEXT,
  reference_number  TEXT,
  note              TEXT,
  verified_by_id    TEXT REFERENCES users(id),
  verified_at       TEXT,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(fund_id, month_number, member_id)
);

-- status: WAITING_COLLECTION | READY | PROCESSING | COMPLETED
CREATE TABLE IF NOT EXISTS payouts (
  id                TEXT PRIMARY KEY,
  fund_id           TEXT NOT NULL REFERENCES funds(id),
  month_number      INTEGER NOT NULL,
  beneficiary_id    TEXT NOT NULL REFERENCES users(id),
  amount            REAL NOT NULL,
  payout_date       TEXT,
  reference_number  TEXT,
  receipt_path      TEXT,
  status            TEXT NOT NULL DEFAULT 'WAITING_COLLECTION',
  completed_by_id   TEXT REFERENCES users(id),
  completed_at      TEXT,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(fund_id, month_number)
);

CREATE TABLE IF NOT EXISTS notifications (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id),
  title      TEXT NOT NULL,
  message    TEXT NOT NULL,
  type       TEXT NOT NULL DEFAULT 'INFO',
  is_read    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id          TEXT PRIMARY KEY,
  user_id     TEXT REFERENCES users(id),
  fund_id     TEXT REFERENCES funds(id),
  action      TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS password_resets (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at    TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_fund_members_fund ON fund_members(fund_id);
CREATE INDEX IF NOT EXISTS idx_payments_fund_month ON payments(fund_id, month_number);
CREATE INDEX IF NOT EXISTS idx_payouts_fund_month ON payouts(fund_id, month_number);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_fund ON audit_logs(fund_id);
CREATE INDEX IF NOT EXISTS idx_fortune_swap_requests_fund ON fortune_swap_requests(fund_id);
