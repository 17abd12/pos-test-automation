import http from "k6/http";
import { check, group, sleep } from "k6";
import { Trend } from "k6/metrics";
import { htmlReport } from "https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js";
import { textSummary } from "https://jslib.k6.io/k6-summary/0.0.1/index.js";

/* ============================================================================
 *  k6 LOAD TEST — full authed read flow across ALL important GET endpoints.
 * ============================================================================
 *  Each VU logs in once (cookie jar carries the token), then loads the
 *  dashboard's endpoints, each wrapped in a group() and timed with its own
 *  Trend metric so the report shows per-endpoint latency. Per-endpoint SLOs
 *  are enforced via thresholds — the run FAILS if any breaks.
 *
 *  Run:  k6 run k6/api-flow.js
 *  Env:  BASE_URL, LOGIN_USER, LOGIN_PASS
 *  Out:  console summary + docs/reports/k6-api-flow.html
 * ========================================================================== */

const BASE = __ENV.BASE_URL || "http://localhost:3000";
const USER = __ENV.LOGIN_USER || "admin";
const PASS = __ENV.LOGIN_PASS || "admin123";

// Endpoints exercised under load (read-only, safe to hammer).
const ENDPOINTS = [
  ["groups", "/api/groups"],
  ["customers", "/api/customers"],
  ["vendors", "/api/vendors"],
  ["inventory", "/api/inventory"],
  ["godams", "/api/godams"],
  ["me", "/api/me"],
];

// One Trend per endpoint → per-endpoint latency in the report.
const trends = {};
for (const [name] of ENDPOINTS) trends[name] = new Trend(`dur_${name}`, true);

export const options = {
  stages: [
    { duration: "15s", target: 10 },
    { duration: "30s", target: 20 },
    { duration: "10s", target: 0 },
  ],
  thresholds: {
    http_req_failed: ["rate<0.01"],
    "http_req_duration{kind:read}": ["p(95)<1000"],
    // Per-endpoint SLOs.
    dur_groups: ["p(95)<800"],
    dur_customers: ["p(95)<1200"], // heavier: computes aging buckets
    dur_vendors: ["p(95)<800"],
    dur_inventory: ["p(95)<1000"],
    dur_godams: ["p(95)<600"],
    dur_me: ["p(95)<400"],
  },
};

export default function () {
  group("login", () => {
    const res = http.post(
      `${BASE}/api/login`,
      JSON.stringify({ username: USER, password: PASS }),
      { headers: { "Content-Type": "application/json" } },
    );
    check(res, { "login 200": (r) => r.status === 200 });
  });

  for (const [name, path] of ENDPOINTS) {
    group(name, () => {
      const res = http.get(`${BASE}${path}`, { tags: { kind: "read", endpoint: name } });
      trends[name].add(res.timings.duration);
      check(res, { [`${name} 200`]: (r) => r.status === 200 });
    });
  }
  sleep(1);
}

export function handleSummary(data) {
  return {
    "docs/reports/k6-api-flow.html": htmlReport(data),
    stdout: textSummary(data, { indent: " ", enableColors: true }),
  };
}
