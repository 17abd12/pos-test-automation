import { defineConfig } from "cypress";
import { readFileSync } from "fs";
import { createHmac } from "crypto";

/* Sign an HS256 JWT with Node's built-in crypto — no external lib. We avoid
 * importing `jose` here because it is pure-ESM and Cypress compiles this config
 * to CommonJS, which would crash on require(). The output is byte-identical to
 * what libs/jwt.ts produces, so middleware.ts verifies it the same way. */
function base64url(input: string): string {
  return Buffer.from(input).toString("base64url");
}
function signHs256(payload: Record<string, unknown>, secret: string): string {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(JSON.stringify(payload));
  const data = `${header}.${body}`;
  const sig = createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${sig}`;
}

/* Cypress' Node process does NOT auto-load .env (only Next.js does). We read
 * JWT_SECRET ourselves so the mintToken task can forge valid session tokens.
 * Real shell env vars win; otherwise fall back to parsing the .env file. */
function loadEnv() {
  if (process.env.JWT_SECRET) return;
  try {
    const txt = readFileSync(".env", "utf8");
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
      }
    }
  } catch {
    /* no .env file — fine if JWT_SECRET comes from the real environment */
  }
}

export default defineConfig({
  e2e: {
    // baseUrl: prepended to every cy.visit() / cy.request() relative path.
    // Lets you write cy.visit("/login") instead of the full URL, and switch
    // environments (local/staging) by changing one line or CYPRESS_BASE_URL env.
    baseUrl: "http://localhost:3000",
    setupNodeEvents(on, config) {
      loadEnv();

      // Tasks run in Node (not the browser), so they can use secrets + crypto.
      on("task", {
        /* Forge a valid auth cookie token WITHOUT a real user in the DB. Signs
         * the same HS256 payload shape that /api/login issues (see libs/jwt.ts),
         * so middleware.ts accepts it. Lets every protected-page spec run with
         * just `npm run dev` — no seeded accounts required. */
        mintToken(opts: {
          role?: string
          username?: string
          name?: string
          ttlSeconds?: number
        } = {}) {
          const { role = "manager", username = "test", name = "Test User", ttlSeconds = 6 * 3600 } = opts;
          if (!process.env.JWT_SECRET) {
            throw new Error("JWT_SECRET not found — set it in .env or the environment");
          }
          const now = Math.floor(Date.now() / 1000);
          return signHs256(
            { username, name, role, iat: now, exp: now + ttlSeconds },
            process.env.JWT_SECRET
          );
        },
      });

      return config;
    },
  },
});
