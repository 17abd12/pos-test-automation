/// <reference types="cypress" />

/* ============================================================================
 *  WAREHOUSE / GODAMS — /warehouse   (Test plan §8)
 * ============================================================================
 *  Two tabs:
 *   • Godam Management — register godams (POST /api/godams) + list them.
 *   • Godam Situation  — pick a godam → view its stock (GET /api/godams/:id/stock).
 * ========================================================================== */

const GODAMS = {
  godams: [
    { id: "gd1", name: "Main Store", location: "Hall A", created_by: "admin", created_at: "2026-01-01T00:00:00Z" },
  ],
}
const STOCK = {
  stock: [
    { id: "s1", inventory_id: "i1", item_name: "Lays Classic", sale_price: 10, cost_price: 8,
      pieces_per_carton: 12, group_name: "Snacks", quantity: 120, added_by: "admin", added_at: "2026-01-02T00:00:00Z" },
  ],
}

describe("Warehouse — manage", () => {
  beforeEach(() => {
    cy.authAs("manager")
    cy.intercept("GET", "/api/godams", GODAMS).as("godams")
    cy.visit("/warehouse")
    cy.wait("@godams")
  })

  // §8.1
  it("renders godam management (smoke)", () => {
    cy.contains("h1", "Warehouse (Godam)").should("be.visible")
    cy.contains("Register New Godam").should("be.visible")
    cy.contains("td", "Main Store").should("be.visible")
  })

  // §8.2 — register a godam → POST with name + location → success toast.
  it("registers a new godam", () => {
    cy.intercept("POST", "/api/godams", {
      statusCode: 200, body: { godam: { id: "gd2", name: "Cold Store" } },
    }).as("create")

    cy.get('input[placeholder="e.g. Main Warehouse, Godam A"]').type("Cold Store")
    cy.get('input[placeholder="e.g. Block B, Floor 2"]').type("Block C")
    cy.contains("button", "Register Godam").click()

    cy.wait("@create").its("request.body").should("deep.eq", { name: "Cold Store", location: "Block C" })
    cy.contains('Godam "Cold Store" registered').should("be.visible")
  })

  // §8.2 sad — name is required (HTML), so empty submit fires no request.
  it("requires a godam name", () => {
    cy.intercept("POST", "/api/godams").as("create")
    cy.contains("button", "Register Godam").click()
    cy.get('input[placeholder="e.g. Main Warehouse, Godam A"]')
      .then(($el) => expect(($el[0] as HTMLInputElement).checkValidity()).to.eq(false))
    cy.get("@create.all").should("have.length", 0)
  })

  // §8.4 — situation tab loads stock for the selected godam.
  it("shows stock for a selected godam", () => {
    cy.intercept("GET", "/api/godams/gd1/stock", STOCK).as("stock")
    cy.contains("button", "Godam Situation").click()
    cy.get("select").first().select("Main Store (Hall A)")
    cy.wait("@stock")
    cy.contains("td", "Lays Classic").should("be.visible")
    cy.contains("Total Stock Value").should("be.visible")
  })
})
