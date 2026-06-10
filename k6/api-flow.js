import http from "k6/http";
import { check, sleep } from "k6";

/* ============================================================================
 *  k6 LOAD TEST — realistic authed read flow.
 * ============================================================================
 *  Each virtual user logs in (cookie jar carries the token), then hits the
 *  list endpoints a real dashboard loads. Run: k6 run k6/api-flow.js
 * ========================================================================== */

const BASE = __ENV.BASE_URL || "http://localhost:3000";
const USER = __ENV.LOGIN_USER || "admin";
const PASS = __ENV.LOGIN_PASS || "admin123";

export const options = {
  vus: 10,
  duration: "30s",
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<1000"],
  },
};

export default function () {
  const login = http.post(
    `${BASE}/api/login`,
    JSON.stringify({ username: USER, password: PASS }),
    { headers: { "Content-Type": "application/json" } },
  );
  check(login, { "login 200": (r) => r.status === 200 });

  // k6's per-VU cookie jar sends the token automatically on these GETs.
  const customers = http.get(`${BASE}/api/customers`);
  check(customers, { "customers 200": (r) => r.status === 200 });

  const inventory = http.get(`${BASE}/api/inventory`);
  check(inventory, { "inventory 200": (r) => r.status === 200 });

  sleep(1);
}
