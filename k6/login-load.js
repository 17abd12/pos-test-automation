import http from "k6/http";
import { check, sleep } from "k6";
// Remote helpers (k6 supports URL imports). Produce an HTML report + console summary.
import { htmlReport } from "https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js";
import { textSummary } from "https://jslib.k6.io/k6-summary/0.0.1/index.js";

/* ============================================================================
 *  k6 LOAD TEST — POST /api/login under ramping load.
 * ============================================================================
 *  Measures auth-endpoint throughput/latency and fails the run if SLOs break.
 *  Run:  k6 run k6/login-load.js
 *  Env:  BASE_URL (default http://localhost:3000), LOGIN_USER, LOGIN_PASS
 *  Output: console summary + docs/reports/k6-report.html
 * ========================================================================== */

const BASE = __ENV.BASE_URL || "http://localhost:3000";
const USER = __ENV.LOGIN_USER || "admin";
const PASS = __ENV.LOGIN_PASS || "admin123";

export const options = {
  stages: [
    { duration: "20s", target: 10 }, // ramp to 10 virtual users
    { duration: "30s", target: 25 }, // sustain 25 VUs
    { duration: "10s", target: 0 },  // ramp down
  ],
  // Service-level objectives — the run FAILS (non-zero exit) if breached.
  thresholds: {
    http_req_failed: ["rate<0.01"],      // <1% errors
    http_req_duration: ["p(95)<800"],    // 95th percentile under 800ms
  },
};

export default function () {
  const res = http.post(
    `${BASE}/api/login`,
    JSON.stringify({ username: USER, password: PASS }),
    { headers: { "Content-Type": "application/json" } },
  );
  check(res, {
    "status is 200": (r) => r.status === 200,
    "sets token cookie": (r) => r.cookies["token"] !== undefined,
  });
  sleep(1);
}

export function handleSummary(data) {
  return {
    "docs/reports/k6-report.html": htmlReport(data),
    stdout: textSummary(data, { indent: " ", enableColors: true }),
  };
}
