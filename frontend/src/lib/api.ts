const TOKEN_KEY = "fahi_fund_token";

// In local dev this stays empty and requests go through Vite's /api proxy to
// the backend. In production (e.g. a Vercel-hosted frontend), set
// VITE_API_BASE_URL to the deployed backend's origin (e.g. a Render URL) at
// build time so the static frontend knows where to send requests.
const API_BASE = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

/** Resolves a path returned by the API (e.g. an uploaded receipt at
 * `/uploads/xyz.png`) against the backend's origin. Safe to call on
 * already-absolute URLs. */
export function assetUrl(path: string | null | undefined): string {
  if (!path) return "";
  if (/^https?:\/\//.test(path)) return path;
  return `${API_BASE}${path}`;
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore storage errors */
  }
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData) && options.body) {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_BASE}/api${path}`, { ...options, headers });
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await res.json().catch(() => null) : await res.text();

  if (!res.ok) {
    const message = isJson && body && typeof body === "object" && "error" in body ? (body as any).error : "Something went wrong";
    throw new ApiError(message, res.status);
  }
  return body as T;
}

export async function downloadFile(path: string, filename: string) {
  const token = getToken();
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`${API_BASE}/api${path}`, { headers });
  if (!res.ok) throw new ApiError("Failed to download file", res.status);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const api = {
  get: <T,>(path: string) => request<T>(path, { method: "GET" }),
  post: <T,>(path: string, data?: unknown) =>
    request<T>(path, { method: "POST", body: data instanceof FormData ? data : data ? JSON.stringify(data) : undefined }),
  patch: <T,>(path: string, data?: unknown) =>
    request<T>(path, { method: "PATCH", body: data instanceof FormData ? data : data ? JSON.stringify(data) : undefined }),
  put: <T,>(path: string, data?: unknown) => request<T>(path, { method: "PUT", body: data ? JSON.stringify(data) : undefined }),
  delete: <T,>(path: string, data?: unknown) => request<T>(path, { method: "DELETE", body: data ? JSON.stringify(data) : undefined }),
};
