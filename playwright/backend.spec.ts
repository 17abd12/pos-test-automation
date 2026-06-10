import { test, expect } from "@playwright/test";
import { loginReal, mintToken } from "./utils/auth";

/* ============================================================================
 *  BACKEND VALIDATION — real API + DB (Playwright `request` fixture).
 * ============================================================================
 *  No UI, no stubs. The `request` fixture keeps a cookie jar, so after
 *  loginReal() every call is authenticated. Self-cleaning on your dev DB:
 *  unique PWTEST_<ts> names + try/finally teardown.
 *  Prereq: app running + admin/admin123 in .env or cypress.env.json copied to env.
 * ========================================================================== */

const PREFIX = `PWTEST_${Date.now()}`;

test.describe("Backend — real DB", () => {
  // AUTHZ — a cashier (forged token via cookie header) cannot create customers.
  test("cashier cannot create a customer (403)", async ({ request }) => {
    const res = await request.post("/api/customers", {
      headers: { cookie: `token=${mintToken("cashier")}` },
      data: { name: `${PREFIX}_x`, group_id: "nope" },
    });
    expect(res.status()).toBe(403);
  });

  // VALIDATION — missing fields → 400 (logged in as manager).
  test("validates required fields (400)", async ({ request }) => {
    await loginReal(request);
    const res = await request.post("/api/customers", { data: { name: "" } });
    expect(res.status()).toBe(400);
  });

  // LIFECYCLE — create → read → update → delete → 404.
  test("customer lifecycle", async ({ request }) => {
    await loginReal(request);
    const grp = await request.post("/api/groups", { data: { name: `${PREFIX}_grp` } });
    const groupId = (await grp.json()).group.id;
    try {
      const created = await request.post("/api/customers", { data: { name: `${PREFIX}_cust`, group_id: groupId } });
      expect(created.status()).toBe(201);
      const id = (await created.json()).customer.id;
      try {
        const list = await (await request.get("/api/customers")).json();
        expect(list.customers.some((c: any) => c.id === id)).toBeTruthy();

        const one = await (await request.get(`/api/customers/${id}`)).json();
        expect(one.customer.balance).toBe(0);

        const upd = await request.put(`/api/customers/${id}`, { data: { name: `${PREFIX}_renamed` } });
        expect(upd.status()).toBe(200);
      } finally {
        await request.delete(`/api/customers/${id}`);
      }
      const gone = await request.get(`/api/customers/${id}`);
      expect(gone.status()).toBe(404);
    } finally {
      await request.delete("/api/groups", { data: { id: groupId } });
    }
  });

  // BUSINESS RULE — opening receivable surfaces in the computed balance.
  test("computes balance from an opening receivable", async ({ request }) => {
    await loginReal(request);
    const grp = await request.post("/api/groups", { data: { name: `${PREFIX}_balgrp` } });
    const groupId = (await grp.json()).group.id;
    let id: string | undefined;
    try {
      const created = await request.post("/api/customers", {
        data: { name: `${PREFIX}_bal`, group_id: groupId, opening_balance: { receivable: [{ amount: 1000, days: 10, description: "t" }] } },
      });
      id = (await created.json()).customer.id;
      const one = await (await request.get(`/api/customers/${id}`)).json();
      expect(one.customer.balance).toBe(1000);
    } finally {
      if (id) await request.delete(`/api/customers/${id}`);
      await request.delete("/api/groups", { data: { id: groupId } });
    }
  });
});
