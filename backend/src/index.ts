import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import path from "path";
import "./lib/db"; // initializes schema on boot
import { seedIfEmpty } from "./scripts/seedIfEmpty";

import authRoutes from "./routes/auth";
import userRoutes from "./routes/users";
import fundRoutes from "./routes/funds";
import paymentRoutes from "./routes/payments";
import payoutRoutes from "./routes/payouts";
import fortuneSwapRoutes from "./routes/fortuneSwaps";
import notificationRoutes from "./routes/notifications";
import auditLogRoutes from "./routes/auditLogs";
import reportRoutes from "./routes/reports";
import dashboardRoutes from "./routes/dashboard";
import systemRoutes from "./routes/system";

const app = express();

// CORS_ORIGIN can be a single origin or a comma-separated list (e.g. your
// Vercel production + preview URLs). Left unset, all origins are allowed —
// fine for local dev, but set this once you have a real frontend URL.
const corsOrigin = process.env.CORS_ORIGIN;
app.use(
  cors({
    origin: corsOrigin ? corsOrigin.split(",").map((o) => o.trim()) : true,
  })
);
app.use(express.json());

const uploadDir = path.resolve(__dirname, "../", process.env.UPLOAD_DIR || "./uploads");
app.use("/uploads", express.static(uploadDir));

app.get("/api/health", (_req, res) => res.json({ ok: true, app: "Fahi Fund API" }));

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/funds", fundRoutes);
app.use("/api/funds/:fundId/payments", paymentRoutes);
app.use("/api/funds/:fundId/payouts", payoutRoutes);
app.use("/api/funds/:fundId/fortune-swaps", fortuneSwapRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/audit-logs", auditLogRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/system", systemRoutes);

// Centralized error handler (covers multer errors and anything unexpected)
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  const message = err?.message || "Internal server error";
  const status = err?.status || 500;
  res.status(status).json({ error: message });
});

app.use((_req, res) => res.status(404).json({ error: "Not found" }));

// Last-resort safety net: Node terminates the whole process on an unhandled
// promise rejection by default (since Node 15). Every async route handler
// is wrapped with asyncHandler() so its errors reach Express's error
// middleware instead, but this catches anything that slips through (a
// stray unawaited promise, a future handler someone forgets to wrap) so a
// single bug can't take the API down for every user.
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection (server kept running):", reason);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception (server kept running):", err);
});

const PORT = Number(process.env.PORT) || 4000;

async function start() {
  // Seeds demo data only if the database is empty (e.g. first boot on a
  // fresh persistent disk). Set SEED_ON_BOOT=false to disable entirely.
  if (process.env.SEED_ON_BOOT !== "false") {
    await seedIfEmpty();
  }
  app.listen(PORT, () => {
    console.log(`Fahi Fund API listening on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error("Failed to start Fahi Fund API:", err);
  process.exit(1);
});
