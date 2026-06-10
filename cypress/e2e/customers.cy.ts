/// <reference types="cypress" />

/* ============================================================================
 *  CUSTOMERS — CRUD, search, aging, authz   (Test plan §5)
 * ============================================================================
 *  THIS FILE IS THE TEMPLATE every other domain spec follows. Pattern:
 *
 *    1. cy.authAs(role)         → forge a session so the protected page loads
 *                                 (middleware.ts needs a valid token; mintToken
 *                                 task signs one — no DB user required).
 *    2. cy.intercept(...)       → STUB the data APIs so the test controls the
 *                                 data and never touches Supabase. Deterministic
 *                                 + runs offline with only `npm run dev`.
 *    3. cy.visit(page)          → render.
 *    4. act + assert on the UI and on the REQUEST the UI sent.
 *
 *  WHY STUB INSTEAD OF REAL DB: a test must be repeatable. Real data changes,
 *  making assertions like "3 customers shown" flaky. Stubbing freezes the world.
 *  We separately verify the real API end-to-end in a small `describe.skip`.
 * ========================================================================== */

// Reusable fake data. Shapes match app/customers/page.tsx `Customer`/`Group`.
const GROUPS = {
  groups: [
    { id: "g1", name: "Wholesale" },
    { id: "g2", name: "Retail" },
  ],
}

const emptyBuckets = { b0_15: 0, b16_30: 0, b31_45: 0, b46_60: 0, b60plus: 0 }

const CUSTOMERS = {
  customers: [
    {
      id: "c1", name: "Al-Madina Store", group_id: "g1", group_name: "Wholesale",
      display: "Al-Madina Store", balance: 15000,
      bucket_totals: { ...emptyBuckets, b0_15: 15000 }, dominant_bucket: "b0_15",
    },
    {
      id: "c2", name: "Bismillah Traders", group_id: "g2", group_name: "Retail",
      display: "Bismillah Traders", balance: 0,
      bucket_totals: { ...emptyBuckets }, dominant_bucket: "none",
    },
  ],
}

// Wire up the three GETs the page fires on load. Call at the top of each test.
function stubLoad() {
  cy.intercept("GET", "/api/groups", GROUPS).as("groups")
  cy.intercept("GET", "/api/customers*", CUSTOMERS).as("customers")
  // /api/me is real (reads our minted token), but stubbing keeps role explicit.
}

describe("Customers — manager", () => {
  beforeEach(() => {
    cy.authAs("manager")
    stubLoad()
    cy.visit("/customers")
    cy.wait("@customers") // ensure list loaded before asserting
  })

  // §5.1 — list renders with stubbed rows.
  it("renders the customer list (smoke)", () => {
    cy.contains("h1", "Customers").should("be.visible")
    cy.contains("Al-Madina Store").should("be.visible")
    cy.contains("Bismillah Traders").should("be.visible")
    cy.contains("2 customers").should("be.visible")
  })

  // §5.1 — outstanding balance formats with thousands separator + 2 decimals.
  it("formats outstanding balance", () => {
    cy.contains("Rs.15,000.00").should("be.visible")
    // A zero-balance customer shows the "Settled" badge.
    cy.contains("Bismillah Traders").parents(".rounded-2xl").contains("Settled")
  })

  // §5.8 — client-side search filters the visible list (no new request).
  it("filters the list by search text", () => {
    cy.get('input[placeholder*="Search by customer name"]').type("madina")
    cy.contains("Al-Madina Store").should("be.visible")
    cy.contains("Bismillah Traders").should("not.exist")
  })

  /* §5.3 — VALIDATION. The "Add Customer" submit is disabled until name AND
   * group are filled (page guards `!form.name.trim() || !form.group_id`). We
   * assert the guard rather than expecting an error message. */
  it("disables submit until name and group are provided", () => {
    cy.contains("button", "+ Add Customer").click()
    // Scope to .modal-box: the header "+ Add Customer" button also matches
    // "Add Customer" and sits BEHIND the modal backdrop — selecting it causes
    // "covered by modal-backdrop" errors and matches the wrong element.
    cy.get(".modal-box").contains("button", "Add Customer").should("be.disabled")

    cy.get('input[placeholder="e.g. Al-Madina Store"]').type("New Shop")
    cy.get(".modal-box").contains("button", "Add Customer").should("be.disabled") // group still empty

    cy.get(".modal-box select").select("Wholesale")
    cy.get(".modal-box").contains("button", "Add Customer").should("not.be.disabled")
  })

  // §5.2 — HAPPY PATH create: fill form → POST sent with right body → toast.
  it("creates a customer", () => {
    cy.intercept("POST", "/api/customers", {
      statusCode: 200, body: { message: "ok", id: "c3" },
    }).as("create")

    cy.contains("button", "+ Add Customer").click()
    cy.get('input[placeholder="e.g. Al-Madina Store"]').type("New Shop")
    cy.get(".modal-box select").select("Wholesale")
    cy.get(".modal-box").contains("button", "Add Customer").click()

    cy.wait("@create").its("request.body").should("deep.include", {
      name: "New Shop", group_id: "g1",
    })
    cy.contains("Customer added").should("be.visible")
  })

  // §5.4 — rename via PUT /api/customers/:id.
  it("renames a customer", () => {
    cy.intercept("PUT", "/api/customers/c1", {
      statusCode: 200, body: { message: "ok" },
    }).as("rename")

    cy.contains("Al-Madina Store").parents(".rounded-2xl")
      .contains("button", "Rename").click()
    cy.get(".modal-box input").clear().type("Al-Madina Wholesale")
    cy.contains("button", "Save Changes").click()

    cy.wait("@rename").its("request.body").should("deep.eq", { name: "Al-Madina Wholesale" })
    cy.contains("Name updated").should("be.visible")
  })

  /* §5.5 — DELETE uses window.confirm(). Cypress auto-accepts confirms, but we
   * make it explicit. Then a DELETE request fires. */
  it("deletes a customer after confirm", () => {
    cy.intercept("DELETE", "/api/customers/c1", {
      statusCode: 200, body: { message: "ok" },
    }).as("del")
    cy.on("window:confirm", () => true) // accept the native dialog

    cy.contains("Al-Madina Store").parents(".rounded-2xl")
      .contains("button", "Delete").click()

    cy.wait("@del")
    cy.contains("Customer deleted").should("be.visible")
  })

  /* §5.5 sad path — server refuses delete (linked records → 400). UI must show
   * the server's error message, not crash. */
  it("shows an error when delete is blocked by linked records", () => {
    cy.intercept("DELETE", "/api/customers/c1", {
      statusCode: 400, body: { message: "Cannot delete — customer has linked records" },
    }).as("del")
    cy.on("window:confirm", () => true)

    cy.contains("Al-Madina Store").parents(".rounded-2xl")
      .contains("button", "Delete").click()

    cy.wait("@del")
    cy.contains("Cannot delete").should("be.visible")
  })

  // §5.7 — aging bucket filter bar renders the configured buckets.
  it("renders the aging bucket filter bar", () => {
    cy.contains("0–15 Days").should("be.visible")
    cy.contains("Above 60 Days").should("be.visible")
  })
})

/* ============================================================================
 *  AUTHZ (§5 cross-cutting) — cashier is read-only on customers.
 * ========================================================================== */
describe("Customers — cashier (read-only)", () => {
  beforeEach(() => {
    cy.authAs("cashier")
    stubLoad()
    cy.visit("/customers")
    cy.wait("@customers")
  })

  it("hides create/rename/delete controls for cashier", () => {
    cy.contains("button", "+ Add Customer").should("not.exist")
    cy.contains("button", "Rename").should("not.exist")
    cy.contains("button", "Delete").should("not.exist")
    // But can still open a ledger (read action).
    cy.contains("a", "View Ledger").should("be.visible")
  })
})

/* ============================================================================
 *  REAL BACKEND (§5) — run against live API/DB. Needs seeded data + creds.
 *  Remove `.skip` once cypress.env.json is set.
 * ========================================================================== */
describe.skip("Customers — real API", () => {
  it("GET /api/customers returns a customers array", () => {
    cy.loginAsManager()
    cy.request("/api/customers").then((res) => {
      expect(res.status).to.eq(200)
      expect(res.body).to.have.property("customers")
      expect(res.body.customers).to.be.an("array")
    })
  })
})
