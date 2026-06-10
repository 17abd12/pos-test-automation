/// <reference types="cypress" />

/* ============================================================================
 *  SUPPLIER EXPENSES — /expenses   (Test plan §12)
 * ============================================================================
 *  Record an expense against a group/supplier, then ADJUST it (deduct from the
 *  supplier's payable) or REVERT the adjustment. The vendor is auto-derived
 *  from the selected group (vendorForGroup).
 *
 *  Lifecycle the tests walk: record (pending) → adjust (deducted) → revert.
 * ========================================================================== */

const GROUPS = { groups: [{ id: "g1", name: "Snacks" }] }
const VENDORS = { vendors: [{ id: "v1", name: "Nestle", group_id: "g1" }] }

const EXPENSES = {
  expenses: [
    { id: "e1", group_id: "g1", group_name: "Snacks", vendor_id: "v1", vendor_name: "Nestle",
      amount: 1000, description: "Breakage", added_by: "admin", added_at: "2026-06-01T10:00:00Z",
      adjusted: false, adjusted_at: null, payable_id: null },
    { id: "e2", group_id: "g1", group_name: "Snacks", vendor_id: "v1", vendor_name: "Nestle",
      amount: 500, description: "Freight", added_by: "admin", added_at: "2026-06-02T10:00:00Z",
      adjusted: true, adjusted_at: "2026-06-03T10:00:00Z", payable_id: "p1" },
  ],
}

function stubLoad() {
  cy.intercept("GET", "/api/groups", GROUPS).as("groups")
  cy.intercept("GET", "/api/vendors", VENDORS).as("vendors")
  cy.intercept("GET", "/api/supplier-expenses*", EXPENSES).as("expenses")
}

describe("Supplier expenses", () => {
  beforeEach(() => {
    cy.authAs("manager")
    stubLoad()
    cy.visit("/expenses")
    cy.wait("@expenses")
  })

  // §12.1
  it("renders expenses with pending/adjusted state (smoke)", () => {
    cy.contains("h1", "Supplier Expenses").should("be.visible")
    cy.contains("Breakage").should("be.visible")
    cy.contains("Pending").should("be.visible")
    cy.contains("Deducted").should("be.visible")
    // Stat cards: pending 1000, adjusted 500.
    cy.contains("Pending Adjustments").parent().contains("Rs.1,000.00")
    cy.contains("Deductions Applied").parent().contains("Rs.500.00")
  })

  // §12.4 — record a new expense (vendor auto-derived from group).
  it("records a new expense", () => {
    cy.intercept("POST", "/api/supplier-expenses", { statusCode: 200, body: { message: "ok" } }).as("create")

    cy.contains("label", "Product Group").parent().find("select").select("Snacks")
    cy.contains("Supplier:").should("contain", "Nestle") // auto-derived hint
    cy.get('input[placeholder="0.00"]').type("750")
    cy.get("textarea").type("Promo discount")
    cy.contains("button", "Record Expense").click()

    cy.wait("@create").its("request.body").should("deep.include", {
      group_id: "g1", vendor_id: "v1", amount: 750, description: "Promo discount",
    })
    cy.contains("Expense recorded").should("be.visible")
  })

  // §12.5 — adjust a pending expense (confirm dialog → POST adjust).
  it("adjusts a pending expense", () => {
    cy.intercept("POST", "/api/supplier-expenses/e1/adjust", { statusCode: 200, body: { message: "ok" } }).as("adjust")
    cy.on("window:confirm", () => true)

    cy.contains(".card", "Breakage").contains("button", "Adjust Balance").click()
    cy.wait("@adjust")
    cy.contains("Balance adjusted").should("be.visible")
  })

  // §12.6 — revert an adjusted expense.
  it("reverts an adjusted expense", () => {
    cy.intercept("POST", "/api/supplier-expenses/e2/revert", { statusCode: 200, body: { message: "ok" } }).as("revert")
    cy.on("window:confirm", () => true)

    cy.contains(".card", "Freight").contains("button", "Revert Adjustment").click()
    cy.wait("@revert")
    cy.contains("Adjustment reverted").should("be.visible")
  })
})
