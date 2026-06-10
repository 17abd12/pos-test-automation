/// <reference types="cypress" />

/* ============================================================================
 *  BACKEND VALIDATION — FULL E2E (real UI → real API → real DB)
 * ============================================================================
 *  No stubs. We drive the actual /customers page, submit the form against the
 *  live API, then VERIFY the row really landed in the DB via a follow-up
 *  cy.request. This is the most realistic test: UI wiring + API + persistence
 *  all in one. Slower and more brittle than API-level tests, so keep these few
 *  and reserved for critical paths.
 *
 *  Self-cleaning on your dev DB: a throwaway group is created via API for the
 *  dropdown, and both the group and the customer are deleted in afterEach.
 * ========================================================================== */

const PREFIX = `CYE2E_${Date.now()}`
let groupId = ""
let groupName = ""
let customerId = ""

describe("Backend E2E — create a customer through the UI", () => {
  beforeEach(() => {
    cy.loginAsManager()
    groupName = `${PREFIX}_grp`
    // Seed a group via API so it appears in the page's group dropdown.
    cy.request("POST", "/api/groups", { name: groupName }).then((res) => {
      groupId = res.body.group.id
    })
    cy.visit("/customers")
  })

  afterEach(() => {
    cy.loginAsManager()
    if (customerId) {
      cy.request({ method: "DELETE", url: `/api/customers/${customerId}`, failOnStatusCode: false })
      customerId = ""
    }
    if (groupId) {
      cy.request({ method: "DELETE", url: "/api/groups", body: { id: groupId }, failOnStatusCode: false })
      groupId = ""
    }
  })

  it("creates a customer via the form and persists it to the DB", () => {
    const custName = `${PREFIX}_cust`

    // Drive the real UI.
    cy.contains("button", "+ Add Customer").click()
    cy.get('input[placeholder="e.g. Al-Madina Store"]').type(custName)
    cy.get(".modal-box select").select(groupName)
    cy.get(".modal-box").contains("button", "Add Customer").click()

    // UI confirms success.
    cy.contains("Customer added").should("be.visible")
    cy.contains(custName).should("be.visible")

    // VERIFY PERSISTENCE: ask the real API and confirm the row exists.
    cy.request("/api/customers").then((res) => {
      const found = res.body.customers.find((c: any) => c.name === custName)
      expect(found, "customer persisted in DB").to.exist
      customerId = found.id // hand off to afterEach for cleanup
      expect(found.group_id).to.eq(groupId)
    })
  })
})
