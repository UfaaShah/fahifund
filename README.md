# Fahi Fund

**Save Together. Receive in Order.**

A mobile-first, full-stack rotating savings (ROSCA) group fund application. A fixed group of
members contribute the same amount every month; a one-time Fortune Wheel spin permanently fixes
the order in which each member receives the pooled monthly total, until everyone has received it
exactly once.

This is a working full-stack build — real authentication, a real database, real business rules
enforced server-side — not a static mockup.

## Stack

- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS v4 + React Router v7 + TanStack Query
- **Backend**: Node.js + Express + TypeScript
- **Database**: SQLite via `better-sqlite3` (see note below on MySQL)
- **Auth**: JWT + bcrypt password hashing, role-based access control enforced on every route

### Why SQLite instead of the MySQL named in the original spec

The build environment for this project had no persistent, network-reachable MySQL server
available, and Prisma's engine binaries couldn't be downloaded on the sandboxed network either.
SQLite via `better-sqlite3` is a drop-in relational substitute with zero external infra — the
schema (`backend/src/lib/schema.sql`) intentionally uses only column shapes that map cleanly to
MySQL (`TEXT` ids, ISO datetime strings, `REAL` for money). To run this against real MySQL in
production: swap `better-sqlite3` for `mysql2`, translate `schema.sql`'s types
(`VARCHAR`/`DATETIME`/`DECIMAL`), and update `backend/src/lib/db.ts`'s connection setup. The rest
of the backend (routes, business logic) is plain SQL via prepared statements and does not depend
on SQLite-specific syntax beyond `strftime()` in the schema defaults.

## Project structure

```
fahi-fund/
  backend/     Express + TypeScript API, SQLite database, seed script
  frontend/    React + TypeScript + Tailwind mobile-first web app
```

## Running it locally

You need Node.js 18+ (built and tested on Node 22).

### 1. Backend

```bash
cd backend
npm install
npm run db:init     # creates the SQLite schema (dev.db)
npm run seed         # wipes and creates a single bootstrap Super Admin — safe to re-run any time
npm run dev           # starts the API on http://localhost:4000
```

`backend/.env` already contains working defaults for local development (`JWT_SECRET`,
`DATABASE_PATH`, `PORT=4000`). Change `JWT_SECRET` before ever deploying this anywhere real.

Uploaded payment/payout receipts are stored under `backend/uploads/` and served at
`/uploads/<filename>`.

There's also a smoke-test script that exercises the full monthly cycle against a running backend
(login → submit payment → confirm → complete payout → run & lock a Fortune Wheel → pull reports
and audit logs → verify role permissions are enforced). It runs against the old, fully-populated
showcase dataset (3 funds, 10 members), not the plain bootstrap account, so seed that first:

```bash
cd backend
npm run seed:showcase   # loads the 3-fund/10-member showcase dataset the smoke test expects
./test-workflow.sh      # requires the dev server running and `jq` installed
```

Re-run `npm run seed:showcase` afterwards to restore the pristine showcase data, since the script
does real writes. Run plain `npm run seed` when you're done to go back to the single bootstrap
Super Admin.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev   # starts Vite on http://localhost:5173
```

The Vite dev server proxies `/api` and `/uploads` to `http://localhost:4000`, so just open
`http://localhost:5173` once both servers are running — no extra config needed.

For a production build: `npm run build` (outputs to `frontend/dist/`), served by any static host
or by Express itself (point `express.static` at `frontend/dist` and add a catch-all route).

## Deploying (Vercel frontend + Render backend)

Vercel alone can't host this: the backend needs a persistent, always-running process (local
SQLite file + local file uploads on disk), which doesn't fit Vercel's stateless serverless
model. The lowest-effort split that works well is **frontend on Vercel, backend on Render**
(an always-on Node host). Do it in this order, since each side needs a URL from the other:

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin <your-repo-url>
git push -u origin main
```

### 2. Backend → Render (free plan, no card required)

`render.yaml` is set up for Render's **free** web service plan by default — no payment info
needed. Either use the included Blueprint or set it up by hand.

**Blueprint (faster):** In the Render dashboard, **New +** → **Blueprint**, point it at this
repo. It reads `render.yaml` at the repo root and creates the web service (free plan) and a
generated `JWT_SECRET` automatically.

**Manual setup:** **New +** → **Web Service**, point it at this repo, choose the **Free**
instance type, then set:

| Setting | Value |
|---|---|
| Root Directory | `backend` |
| Build Command | `npm install && npm run build` |
| Start Command | `npm start` |
| Health Check Path | `/api/health` |

Add these environment variables (see `backend/.env.example` for details on each):
`DATABASE_PATH`, `UPLOAD_DIR`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `SEED_ON_BOOT`. Leave
`CORS_ORIGIN` for step 4.

**Free tier vs. persistent data**: on the free plan there's no persistent disk (that's a paid
feature — Starter plan or above), so SQLite and uploaded files live on the instance's local,
ephemeral storage. That storage is wiped on every deploy, and free instances also auto-sleep
after 15 minutes of inactivity — the *next* request wakes a fresh instance with a fresh disk,
so in practice the demo data resets itself fairly often (harmless — `SEED_ON_BOOT` reloads it
automatically) and any real payments/uploads you add in between won't survive a sleep cycle.
That's completely fine for trying this out or demoing it; it's not suitable for data you need
to keep. If you outgrow that: upgrade the service to a Starter plan, add a **Disk** (e.g.
mounted at `/var/data`), and change `DATABASE_PATH`/`UPLOAD_DIR` to paths under it — no code
changes needed, since both are already read from environment variables.

Once deployed, note the backend's URL (e.g. `https://fahi-fund-api.onrender.com`). The free
plan's cold start (waking a sleeping instance) can take 30–60 seconds, so the first request
after a quiet period will feel slow — that's normal.

### 3. Frontend → Vercel

Import this repo into Vercel, then set:

| Setting | Value |
|---|---|
| Root Directory | `frontend` |
| Environment Variable | `VITE_API_BASE_URL` = your Render backend URL from step 2 |

Deploy. `frontend/vercel.json` already rewrites all routes to `index.html`, so refreshing on a
client-side route (e.g. `/funds/123`) won't 404.

### 4. Point the backend's CORS back at the frontend

`CORS_ORIGIN` is marked `sync: false` in `render.yaml`, so it's not set automatically — go back
to the Render service's environment variables and set it to your Vercel URL(s) (production
domain, and any preview domains you want to allow), comma-separated:

```
CORS_ORIGIN=https://fahi-fund.vercel.app,https://fahi-fund-git-main-yourname.vercel.app
```

Redeploy the backend for the change to take effect. At that point the deployed frontend and
backend are talking to each other.

## Default account

`npm run seed` (and first boot of a fresh deployment — see `seedIfEmpty.ts`) creates a single
Super Admin account and nothing else:

| Name | Login | Password |
|---|---|---|
| Ahmed Shah | `ahmed.shah@fahifund.com` | `welcome123` |

Every account created afterwards via **Add Member** also starts on the same default password,
`welcome123`, shown once to the Super Admin so they can share it — everyone is expected to change
their own password after first login via **Profile → Change Password**.

The login page's old "Demo accounts" quick-fill buttons have been removed now that this is a real
account, not a showcase.

### Showcase dataset (for local testing only)

`npm run seed:showcase` loads the old, fully-populated 3-fund/10-member demo dataset that
`test-workflow.sh` exercises. Password for every account in it: **`Demo@1234`**

| Role | Email | Notes |
|---|---|---|
| Super Admin | `superadmin@fahifund.test` | Full control over every fund |
| Admin | `ahmed.shah@fahifund.test` | Collects for *Fahi Fund - Demo 2026* |
| Member | `ali.waheed@fahifund.test` | Also Admin of *Fahi Fund - Family Circle* |
| Member | `hassan.ibrahim@fahifund.test` | Next in line to receive, month 3 of 10 |

This is separate from the real `ahmed.shah@fahifund.com` Super Admin above — same first name,
different account, only used for local development/testing.

The Login page also has one-tap buttons that fill these in.

Three demo funds are seeded, in different states so every part of the app has something to show:

- **Fahi Fund - Demo 2026** (10 members, 10 months) — 2 months completed with real payout
  history, month 3 in progress (8/10 confirmed, 1 awaiting the Admin's own confirmation, 1 member
  hasn't submitted yet) — a realistic mid-cycle state to poke at.
- **Fahi Fund - Family Circle** (5 members, 5 months) — month 1 fully collected and sitting at
  "Ready for Payout", so you can complete a payout immediately without any setup.
- **Fahi Fund - Office Group** (6 members) — members added, Fortune Wheel **not yet run**, so you
  can spin and lock it yourself from the Super Admin's Fortune Wheel page.

## What's implemented

Every business rule and workflow step in the original spec is enforced **server-side**, not just
hidden in the UI:

- 3 roles (Super Admin / Admin / Member) with server-side authorization on every route
- Fund creation, member management, Admin assignment (with an audit trail note that the new
  Admin's bank account becomes the collection account going forward)
- Fortune Wheel: cryptographically-random shuffle, animated spin + sequential reveal, explicit
  lock step, and a Super-Admin-only reset path that's blocked once any payment has been confirmed
- The monthly cycle (open → deposits → verification → collection complete → payout → next month)
  is derived live from payment/payout data, not a separate state machine that can drift out of
  sync
- Payment submission with optional receipt upload, Admin confirm/reject with a reason, automatic
  resubmission support after rejection
- Payout completion with date/reference/proof, and a Super-Admin-only override for an incomplete
  collection
- Reports (fund / monthly / member) as both on-screen tables and CSV downloads
- A full audit log (fund creation, member changes, Fortune Wheel events, payment/payout actions,
  admin reassignment, resets) — Super Admin only
- Notifications (reminders, confirmations, rejections, payout events) per user
- Mobile-first responsive UI with role-specific bottom navigation, and a full desktop sidebar
  layout at `md:` breakpoints

## What's simplified for this build

Called out here rather than left silent:

- **Email/SMS delivery**: there's no mail/SMS provider wired up. "Forgot password" and "new member
  invitation" both work end-to-end, but return the reset token / temporary password directly in
  the API response instead of sending it — clearly labeled as a dev-mode stand-in in both the API
  and the UI. Wiring a real provider (e.g. Postmark/Twilio) is a contained change in
  `backend/src/routes/auth.ts` and `users.ts`.
- **File storage**: uploaded receipts/proofs are written to local disk
  (`backend/uploads/`, or `UPLOAD_DIR` on a Render persistent disk — see "Deploying" above).
  For a larger real deployment, swap the `multer` disk storage in
  `backend/src/middleware/upload.ts` for S3-compatible object storage instead.
- **MySQL**: see the stack note above.

## Security notes

- Passwords are hashed with bcrypt; hashes are never sent to the client.
- JWT auth on every protected route; role checks happen server-side (`middleware/auth.ts`), so
  hiding a button in the UI is never the only thing standing between a user and an action —
  every mutation re-checks the requester's actual role and, for fund-scoped actions, whether
  they're that specific fund's Admin.
- Financial rows (`payments`, `payouts`) are never deleted — rejections and resets are recorded as
  status changes and audit log entries, never row deletions.
- File uploads are limited to 8MB, restricted to PNG/JPG/WEBP/PDF by MIME type, and written under
  randomly-generated filenames.
- Secrets live in `backend/.env` (gitignored), never hard-coded in source.

- CORS is controlled by `CORS_ORIGIN` (see "Deploying" above) — left unset it allows all
  origins, which is fine for local development but should be locked to your real frontend
  URL(s) in any deployment.

For a real deployment, also add: rate limiting on `/auth/login`, HTTPS termination, and a
production-grade `JWT_SECRET` (the Render Blueprint generates one automatically).
