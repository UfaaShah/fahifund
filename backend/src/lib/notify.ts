import { db } from "./db";
import { newId } from "./ids";

export function notify(params: {
  userId: string;
  title: string;
  message: string;
  type?: "INFO" | "REMINDER" | "PAYMENT" | "PAYOUT" | "SUCCESS" | "WARNING";
}) {
  db.prepare(
    `INSERT INTO notifications (id, user_id, title, message, type) VALUES (?, ?, ?, ?, ?)`
  ).run(newId(), params.userId, params.title, params.message, params.type || "INFO");
}

export function notifyMany(userIds: string[], params: { title: string; message: string; type?: string }) {
  const stmt = db.prepare(
    `INSERT INTO notifications (id, user_id, title, message, type) VALUES (?, ?, ?, ?, ?)`
  );
  const tx = db.transaction((ids: string[]) => {
    for (const id of ids) {
      stmt.run(newId(), id, params.title, params.message, params.type || "INFO");
    }
  });
  tx(userIds);
}
