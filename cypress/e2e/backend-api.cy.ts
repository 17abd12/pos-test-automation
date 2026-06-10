/// <reference types="cypress" />

/* ============================================================================
 *  BACKEND VALIDATION — API LEVEL (real DB, self-cleaning)
 * ============================================================================
 *  These tests DO NOT stub. They hit the real API + Supabase to verify:
 *    • authorization (manager-only writes)
 *    • input validation (400s)
 *    • the full lifecycle: create → read → update → delete
 *    • a BUSINESS RULE: opening-balance receivable shows up in the computed
 *      customer balance (logic a stub could never catch)
 *
 *  RUNS AGAINST YOUR DEV DB. To stay clean we:
 *    • name everything with a unique CYTEST_<timestamp> prefix
 *    • track created IDs and delete them in afterEach (even if a test fails)
 *  Prereq: `npm run dev` running + admin/admin123 in cypress.env.json.
 *
 *  Auth note: the API checks the JWT ROLE, not the DB. So cy.authAs("cashier")
 *  (a forged token) is enough to prove the 403 path — no cashier row needed.
 *  For the manager path we use cy.loginAsManager() (real /api/login) so the
 *  login + cookie + admin's real role are all exercised too.
 * ========================================================================== */

const PREFIX = `CYTEST_${Date.now()}`

// IDs created during a test; afterEach deletes them so the DB is left clean.
const trash = { customers: [] as string[], groups: [] as string[] }

function trackCustomer(id: string) { trash.customers.push(id) }
function trackGroup(id: string) { trash.groups.push(id) }

// Create a throwaway group via API and return its id (most tests need one).
function makeGroup(suffix = ""): Cypress.Chainable<string> {
  return cy.request("POST", "/api/groups", { name: `${PREFIX}_grp${suffix}` })
    .then((res) => {
      expect(res.status).to.eq(201)
      const id = res.body.group.id
      trackGroup(id)
      return id
    })
}

describe("Backend API — customers", () => {
  beforeEach(() => {
    cy.loginAsManager() // real login; cy.session caches it across tests
  })

  // Delete everything this test created, regardless of pass/fail.
  afterEach(() => {
    cy.loginAsManager()
    trash.customers.splice(0).forEach((id) =>
      cy.request({ method: "DELETE", url: `/api/customers/${id}`, failOnStatusCode: false })
    )
    trash.groups.splice(0).forEach((id) =>
      cy.request({ method: "DELETE", url: "/api/groups", body: { id }, failOnStatusCode: false })
    )
  })

  // AUTHZ — a cashier (forged token) cannot create customers.
  it("rejects customer creation for non-managers (403)", () => {
    cy.authAs("cashier")
    cy.request({
      method: "POST", url: "/api/customers",
      body: { name: `${PREFIX}_x`, group_id: "whatever" },
      failOnStatusCode: false,
    }).then((res) => expect(res.status).to.eq(403))
  })

  // VALIDATION — missing name/group_id → 400.
  it("validates required fields (400)", () => {
    cy.request({
      method: "POST", url: "/api/customers", body: { name: "" }, failOnStatusCode: false,
    }).then((res) => expect(res.status).to.eq(400))
  })

  // LIFECYCLE — create → list → get → rename → delete → gone.
  it("supports the full customer lifecycle", () => {
    makeGroup().then((groupId) => {
      const name = `${PREFIX}_cust`

      // CREATE
      cy.request("POST", "/api/customers", { name, group_id: groupId }).then((res) => {
        expect(res.status).to.eq(201)
        const id = res.body.customer.id
        trackCustomer(id)

        // READ (list) — our customer is present
        cy.request("/api/customers").then((list) => {
          const found = list.body.customers.find((c: any) => c.id === id)
          expect(found, "new customer in list").to.exist
          expect(found.name).to.eq(name)
        })

        // READ (by id) — fresh customer has zero balance
        cy.request(`/api/customers/${id}`).then((one) => {
          expect(one.body.customer.balance).to.eq(0)
        })

        // UPDATE (rename)
        cy.request("PUT", `/api/customers/${id}`, { name: `${name}_renamed` }).then((upd) => {
          expect(upd.status).to.eq(200)
          expect(upd.body.customer.name).to.eq(`${name}_renamed`)
        })

        // DELETE
        cy.request("DELETE", `/api/customers/${id}`).its("status").should("eq", 200)

        // CONFIRM GONE
        cy.request({ url: `/api/customers/${id}`, failOnStatusCode: false })
          .its("status").should("eq", 404)
      })
    })
  })

  /* BUSINESS RULE — an opening-balance receivable must surface in the computed
   * balance. Create with receivable 1000 (10 days old) → GET balance == 1000.
   * This validates server-side aging/balance logic end to end. */
  it("computes balance from an opening receivable", () => {
    makeGroup("_bal").then((groupId) => {
      cy.request("POST", "/api/customers", {
        name: `${PREFIX}_bal`,
        group_id: groupId,
        opening_balance: { receivable: [{ amount: 1000, days: 10, description: "Test bill" }] },
      }).then((res) => {
        const id = res.body.customer.id
        trackCustomer(id)
        cy.request(`/api/customers/${id}`).then((one) => {
          expect(one.body.customer.balance).to.eq(1000)
          // 10 days old → falls in the b0_15 ("0–15 days") bucket in the list view.
          cy.request("/api/customers").then((list) => {
            const found = list.body.customers.find((c: any) => c.id === id)
            expect(found.bucket_totals.b0_15).to.eq(1000)
          })
        })
      })
    })
  })
})

describe("Backend API — groups", () => {
  beforeEach(() => cy.loginAsManager())
  afterEach(() => {
    cy.loginAsManager()
    trash.groups.splice(0).forEach((id) =>
      cy.request({ method: "DELETE", url: "/api/groups", body: { id }, failOnStatusCode: false })
    )
  })

  it("rejects group creation for non-managers (403)", () => {
    cy.authAs("cashier")
    cy.request({ method: "POST", url: "/api/groups", body: { name: `${PREFIX}_x` }, failOnStatusCode: false })
      .then((res) => expect(res.status).to.eq(403))
  })

  it("creates and deletes a group", () => {
    cy.request("POST", "/api/groups", { name: `${PREFIX}_g` }).then((res) => {
      expect(res.status).to.eq(201)
      const id = res.body.group.id
      cy.request("/api/groups").then((list) => {
        expect(list.body.groups.some((g: any) => g.id === id)).to.be.true
      })
      cy.request("DELETE", "/api/groups", { id }).its("status").should("eq", 200)
    })
  })
})
