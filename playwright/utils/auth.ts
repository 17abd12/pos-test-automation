import { readFileSync } from "fs";
import path from "path";
import { createHmac } from "crypto";
import type { BrowserContext, APIRequestContext } from "@playwright/test";

/* ============================================================================
 *  AUTH HELPERS  — Playwright equivalent of cypress/support/commands.ts
 * ============================================================================
 *  mintToken()  — forge a valid HS256 session token (no DB user needed), so
 *                 protected pages load. Signed with the app's JWT_SECRET, byte-
 *                 identical to libs/jwt.ts, so middleware.ts accepts it.
 *  authAs()     — plant that token as the `token` cookie on a browser context.
 *  loginReal()  — real POST /api/login (admin/admin123), for backend tests.
 * ========================================================================== */

export const BASE_URL = process.env.PW_BASE_URL || "http://localhost:3000";

function loadSecret(): string {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  // Fallback: parse .env directly (dotenv/config in the config usually covers this).
  try {
    const txt = readFileSync(path.resolve(process.cwd(), ".env"), "utf8");
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
      if (m && m[1] === "JWT_SECRET") return m[2].replace(/^['"]|['"]$/g, "");
    }
  } catch { /* ignore */ }
  throw new Error("JWT_SECRET not found — set it in .env or the environment");
}

const b64url = (s: string) => Buffer.from(s).toString("base64url");

export function mintToken(role: "manager" | "cashier" = "manager"): string {
  const secret = loadSecret();
  const now = Math.floor(Date.now() / 1000);
  const payload = { username: "test", name: "Test User", role, iat: now, exp: now + 6 * 3600 };
  const data = `${b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${b64url(JSON.stringify(payload))}`;
  const sig = createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${sig}`;
}

/** Forge a session (no DB). Call before page.goto on protected routes. */
export async function authAs(context: BrowserContext, role: "manager" | "cashier" = "manager") {
  await context.addCookies([{ name: "token", value: mintToken(role), url: BASE_URL }]);
}

/** Real login via the API. Returns the token cookie value. Used by backend specs. */
export async function loginReal(
  request: APIRequestContext,
  username = process.env.LOGIN_USER || "admin",
  password = process.env.LOGIN_PASS || "admin123",
): Promise<void> {
  const res = await request.post("/api/login", { data: { username, password } });
  if (!res.ok()) throw new Error(`login failed: ${res.status()}`);
}
