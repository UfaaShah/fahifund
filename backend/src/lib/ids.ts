import crypto from "crypto";

export function newId(): string {
  return crypto.randomUUID();
}

/** Generate the next sequential member code, e.g. FF-0001, FF-0002 ... */
export function nextMemberCode(lastCode: string | null): string {
  const lastNum = lastCode ? parseInt(lastCode.replace("FF-", ""), 10) : 0;
  const next = (Number.isFinite(lastNum) ? lastNum : 0) + 1;
  return `FF-${String(next).padStart(4, "0")}`;
}
