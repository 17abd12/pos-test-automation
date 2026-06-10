/// <reference types="cypress" />

/* ============================================================================
 *  PAYMENTS — /payments   (Test plan §11)
 * ============================================================================
 *  Two tabs: customer receipts (POST /api/payments/customer) and supplier
 *  payouts (POST /api/payments/vendor). Party select is gated on group; if a
 *  group has exactly one party the page auto-selects it.
 * ========================================================================== */

const GROUPS = { groups: [{ id: "g1", name: "Snacks" }] }
const CUSTOMERS = { customers: [{ id: "c1", display: "Al-Madina Store", group_id: "g1" }] }
const VENDORS = { vendors: [{ id: "v1", display: "Nestle", group_id: "g1" }] }

function stubLoad() {
  cy.intercept("GET", "/api/groups", GROUPS).as("groups")
  cy.intercept("GET", "/api/customers", CUSTOMERS).as("customers")
  cy.intercept("GET", "/api/vendors", VENDORS).as("vendors")
  cy.intercept("GET", "/api/payments/customer", { payments: [] }).as("recentCust")
  cy.intercept("GET", "/api/payments/vendor", { payments: [] }).as("recentVend")
}

describe("Payments", () => {
  beforeEach(() => {
    cy.authAs("manager")
    stubLoad()
    cy.visit("/payments")
    cy.wait(["@groups", "@customers", "@vendors"])
  })

  // §11.1
  it("renders the payments page (smoke)", () => {
    cy.contains("h1", "Record Payments").should("be.visible")
    cy.contains("Customer Payment Received").should("be.visible")
  })

  // §11.4 sad — no party selected.
  it("requires a party", () => {
    cy.intercept("POST", "/api/payments/customer").as("pay")
    cy.contains("button", "Record Transaction").click()
    cy.contains("Select a party").should("be.visible")
    cy.get("@pay.all").should("have.length", 0)
  })

  // §11.4 sad — invalid amount.
  it("requires a positive amount", () => {
    cy.intercept("POST", "/api/payments/customer").as("pay")
    cy.contains("label", "Select Product Group").parent().find("select").select("Snacks")
    // single customer auto-selected; leave amount empty
    cy.contains("button", "Record Transaction").click()
    cy.contains("Enter a valid amount").should("be.visible")
    cy.get("@pay.all").should("have.length", 0)
  })

  // §11.2 — record a customer receipt.
  it("records a customer payment", () => {
    cy.intercept("POST", "/api/payments/customer", { statusCode: 200, body: { message: "ok" } }).as("pay")

    cy.contains("label", "Select Product Group").parent().find("select").select("Snacks")
    cy.contains("label", "Select Customer").parent().find("select").should("have.value", "c1") // auto-selected
    cy.get('input[placeholder="0.00"]').type("1500")
    cy.contains("button", "Record Transaction").click()

    cy.wait("@pay").its("request.body").should("deep.include", { customer_id: "c1", amount: 1500 })
    cy.contains("Payment recorded").should("be.visible")
  })

  // §11.3 — record a supplier payout on the vendor tab.
  it("records a vendor payment", () => {
    cy.intercept("POST", "/api/payments/vendor", { statusCode: 200, body: { message: "ok" } }).as("pay")

    cy.contains("button", "Supplier Payment Made").click()
    cy.contains("label", "Select Product Group").parent().find("select").select("Snacks")
    cy.contains("label", "Select Supplier").parent().find("select").should("have.value", "v1")
    cy.get('input[placeholder="0.00"]').type("3000")
    cy.contains("button", "Record Transaction").click()

    cy.wait("@pay").its("request.body").should("deep.include", { vendor_id: "v1", amount: 3000 })
    cy.contains("Payment recorded").should("be.visible")
  })
})
