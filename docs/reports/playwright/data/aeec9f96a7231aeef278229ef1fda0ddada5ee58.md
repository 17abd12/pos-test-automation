# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: backend.spec.ts >> Backend — real DB >> cashier cannot create a customer (403)
- Location: playwright/backend.spec.ts:17:7

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 403
Received: 401
```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | import { loginReal, mintToken } from "./utils/auth";
  3  | 
  4  | /* ============================================================================
  5  |  *  BACKEND VALIDATION — real API + DB (Playwright `request` fixture).
  6  |  * ============================================================================
  7  |  *  No UI, no stubs. The `request` fixture keeps a cookie jar, so after
  8  |  *  loginReal() every call is authenticated. Self-cleaning on your dev DB:
  9  |  *  unique PWTEST_<ts> names + try/finally teardown.
  10 |  *  Prereq: app running + admin/admin123 in .env or cypress.env.json copied to env.
  11 |  * ========================================================================== */
  12 | 
  13 | const PREFIX = `PWTEST_${Date.now()}`;
  14 | 
  15 | test.describe("Backend — real DB", () => {
  16 |   // AUTHZ — a cashier (forged token via cookie header) cannot create customers.
  17 |   test("cashier cannot create a customer (403)", async ({ request }) => {
  18 |     const res = await request.post("/api/customers", {
  19 |       headers: { cookie: `token=${mintToken("cashier")}` },
  20 |       data: { name: `${PREFIX}_x`, group_id: "nope" },
  21 |     });
> 22 |     expect(res.status()).toBe(403);
     |                          ^ Error: expect(received).toBe(expected) // Object.is equality
  23 |   });
  24 | 
  25 |   // VALIDATION — missing fields → 400 (logged in as manager).
  26 |   test("validates required fields (400)", async ({ request }) => {
  27 |     await loginReal(request);
  28 |     const res = await request.post("/api/customers", { data: { name: "" } });
  29 |     expect(res.status()).toBe(400);
  30 |   });
  31 | 
  32 |   // LIFECYCLE — create → read → update → delete → 404.
  33 |   test("customer lifecycle", async ({ request }) => {
  34 |     await loginReal(request);
  35 |     const grp = await request.post("/api/groups", { data: { name: `${PREFIX}_grp` } });
  36 |     const groupId = (await grp.json()).group.id;
  37 |     try {
  38 |       const created = await request.post("/api/customers", { data: { name: `${PREFIX}_cust`, group_id: groupId } });
  39 |       expect(created.status()).toBe(201);
  40 |       const id = (await created.json()).customer.id;
  41 |       try {
  42 |         const list = await (await request.get("/api/customers")).json();
  43 |         expect(list.customers.some((c: any) => c.id === id)).toBeTruthy();
  44 | 
  45 |         const one = await (await request.get(`/api/customers/${id}`)).json();
  46 |         expect(one.customer.balance).toBe(0);
  47 | 
  48 |         const upd = await request.put(`/api/customers/${id}`, { data: { name: `${PREFIX}_renamed` } });
  49 |         expect(upd.status()).toBe(200);
  50 |       } finally {
  51 |         await request.delete(`/api/customers/${id}`);
  52 |       }
  53 |       const gone = await request.get(`/api/customers/${id}`);
  54 |       expect(gone.status()).toBe(404);
  55 |     } finally {
  56 |       await request.delete("/api/groups", { data: { id: groupId } });
  57 |     }
  58 |   });
  59 | 
  60 |   // BUSINESS RULE — opening receivable surfaces in the computed balance.
  61 |   test("computes balance from an opening receivable", async ({ request }) => {
  62 |     await loginReal(request);
  63 |     const grp = await request.post("/api/groups", { data: { name: `${PREFIX}_balgrp` } });
  64 |     const groupId = (await grp.json()).group.id;
  65 |     let id: string | undefined;
  66 |     try {
  67 |       const created = await request.post("/api/customers", {
  68 |         data: { name: `${PREFIX}_bal`, group_id: groupId, opening_balance: { receivable: [{ amount: 1000, days: 10, description: "t" }] } },
  69 |       });
  70 |       id = (await created.json()).customer.id;
  71 |       const one = await (await request.get(`/api/customers/${id}`)).json();
  72 |       expect(one.customer.balance).toBe(1000);
  73 |     } finally {
  74 |       if (id) await request.delete(`/api/customers/${id}`);
  75 |       await request.delete("/api/groups", { data: { id: groupId } });
  76 |     }
  77 |   });
  78 | });
  79 | 
```