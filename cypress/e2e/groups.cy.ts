/// <reference types="cypress" />

/* ============================================================================
 *  GROUPS — /groups   (Test plan §10)
 * ============================================================================
 *  Product groups isolate ledgers. Page loads groups, then fetches each
 *  group's net account position from /api/account/:id in parallel.
 *
 *  ⚠️ gap: handleDelete() exists but no button calls it (dead code, like
 *  vendors/inventory). No delete UI → covered only at API level.
 * ========================================================================== */

const GROUPS = {
  groups: [
    { id: "g1", name: "Snacks", created_at: "2026-01-01T00:00:00Z" },
    { id: "g2", name: "Drinks", created_at: "2026-02-01T00:00:00Z" },
  ],
}

function stubLoad() {
  cy.intercept("GET", "/api/groups", GROUPS).as("groups")
  cy.intercept("GET", "/api/account/g1", { account: { netAccount: 5000 } }).as("acc1")
  cy.intercept("GET", "/api/account/g2", { account: { netAccount: -2000 } }).as("acc2")
}

describe("Groups — manager", () => {
  beforeEach(() => {
    cy.authAs("manager")
    stubLoad()
    cy.visit("/groups")
    cy.wait("@groups")
  })

  // §10.1
  it("renders the group list (smoke)", () => {
    cy.contains("h1", "Product Groups").should("be.visible")
    cy.contains("Snacks").should("be.visible")
    cy.contains("Drinks").should("be.visible")
  })

  // §10.4 — net account position badge comes from /api/account/:id.
  it("shows each group's net account position", () => {
    cy.wait(["@acc1", "@acc2"])
    cy.contains("Account Net Position: Rs.5,000").should("be.visible")
    cy.contains("Account Net Position: (Rs.2,000)").should("be.visible") // negative shown in parens
  })

  // §10.2 — create a group.
  it("creates a group", () => {
    cy.intercept("POST", "/api/groups", { statusCode: 200, body: { message: "ok" } }).as("create")
    cy.contains("button", "+ New Group").click()
    cy.get('input[placeholder="e.g. Snacks"]').type("Dairy")
    cy.contains("button", "Create Group").click()
    cy.wait("@create").its("request.body").should("deep.eq", { name: "Dairy" })
    cy.contains("Group created").should("be.visible")
  })
})

/* §10.1 — cashier reaches groups but cannot create. */
describe("Groups — cashier", () => {
  beforeEach(() => {
    cy.authAs("cashier")
    stubLoad()
    cy.visit("/groups")
    cy.wait("@groups")
  })

  it("hides New Group for cashier", () => {
    cy.contains("Snacks").should("be.visible")
    cy.contains("button", "+ New Group").should("not.exist")
  })
})
