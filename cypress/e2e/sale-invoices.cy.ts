/// <reference types="cypress" />

/* ============================================================================
 *  SALE INVOICES — /sales/new   (Test plan §4)
 * ============================================================================
 *  The revenue path. Flow the page enforces:
 *    1. pick a customer (products stay DISABLED until one is chosen)
 *    2. search + add products as line items (default unit = cartons)
 *    3. set payment / discount → totals compute
 *    4. submit → POST /api/sale-invoices → success screen with INV-<seq_no>
 *
 *  REGRESSION-CRITICAL CONVERSION: line prices are entered per CARTON but the
 *  API is sent per-PIECE (carton price / pieces_per_carton). We assert the
 *  exact payload so this money math can't silently drift.
 *
 *  Stubs include ONE godam so the line's godam auto-fills (page auto-assigns
 *  when godams.length === 1), keeping the test focused on the sale flow.
 * ========================================================================== */

const CUSTOMERS = {
  customers: [
    { id: "c1", name: "Al-Madina", group_id: "g1", group_name: "Wholesale", display: "Al-Madina Store" },
  ],
}
const INVENTORY = {
  items: [
    { id: "i1", name: "Lays Classic", cost_price: 8, sale_price: 10, no_of_units: 100,
      pieces_per_carton: 12, group_id: "g1", group_name: "Snacks" },
  ],
}
const GODAMS = { godams: [{ id: "gd1", name: "Main Store", location: "Hall A" }] }

function stubLoad() {
  cy.intercept("GET", "/api/customers", CUSTOMERS).as("customers")
  cy.intercept("GET", "/api/inventory", INVENTORY).as("inventory")
  cy.intercept("GET", "/api/godams", GODAMS).as("godams")
}

// Helper: pick the only customer from the search dropdown.
function selectCustomer() {
  cy.get('input[placeholder="Search customer..."]').type("Al-Madina")
  cy.contains("li", "Al-Madina Store").click()
  cy.contains("Selected: Al-Madina Store").should("be.visible")
}

// Helper: add the only product as a line.
function addProduct() {
  cy.get('input[placeholder="Search any product..."]').type("Lays")
  cy.contains("li", "Lays Classic").click()
}

describe("Sale invoice — create", () => {
  beforeEach(() => {
    cy.authAs("manager")
    stubLoad()
    cy.visit("/sales/new")
    cy.wait(["@customers", "@inventory", "@godams"])
  })

  // §4.1
  it("renders the new sale invoice page (smoke)", () => {
    cy.contains("h1", "New Sale Invoice").should("be.visible")
    cy.contains("Select Customer").should("be.visible")
  })

  // §4.3 — product search is disabled until a customer is chosen.
  it("disables product entry until a customer is selected", () => {
    cy.get('input[placeholder="Search any product..."]').should("be.disabled")
    selectCustomer()
    cy.get('input[placeholder="Search any product..."]').should("not.be.disabled")
  })

  // §4.2 — adding a product creates a line; carton price = 10 × 12 = 120.
  it("adds a line item and computes totals", () => {
    selectCustomer()
    addProduct()
    cy.contains("td", "Lays Classic").should("be.visible")
    cy.contains("Subtotal: Rs.120.00").should("be.visible")
    cy.contains("Total: Rs.120.00").should("be.visible")
  })

  // §4.2 edge — discount reduces the grand total (120 − 20 = 100).
  it("applies a discount to the total", () => {
    selectCustomer()
    addProduct()
    cy.get('input[type=number]').filter(":visible").last() // discount field
    cy.contains("label", "Discount (Rs.)").parent().find("input").clear().type("20")
    cy.contains("Total: Rs.100.00").should("be.visible")
  })

  // §4.5 sad — submitting with no customer is blocked with a toast.
  it("requires a customer", () => {
    cy.intercept("POST", "/api/sale-invoices").as("create")
    cy.contains("button", "Create Sale Invoice").click()
    cy.contains("Select a customer").should("be.visible")
    cy.get("@create.all").should("have.length", 0)
  })

  /* §4.4 — HAPPY PATH. Submit sends per-piece price (120/12 = 10) and on
   * success shows the INV-<seq_no> confirmation screen. */
  it("creates the invoice with a per-piece price payload", () => {
    cy.intercept("POST", "/api/sale-invoices", {
      statusCode: 200,
      body: { invoice: { id: "inv1", seq_no: "42" } },
    }).as("create")

    selectCustomer()
    addProduct()
    cy.contains("button", "Create Sale Invoice").click()

    cy.wait("@create").then(({ request }) => {
      expect(request.body).to.deep.include({ customer_id: "c1", payment: "Credit", discount: 0 })
      expect(request.body.items[0]).to.deep.include({
        inventory_id: "i1", quantity: 1, unit_type: "cartons",
        sale_price: 10, godam_id: "gd1",
      })
    })

    cy.contains("Invoice Created!").should("be.visible")
    cy.contains("Sale INV-42").should("be.visible")
  })

  // §4.2 — a line can be removed before submitting.
  it("removes a line item", () => {
    selectCustomer()
    addProduct()
    cy.contains("td", "Lays Classic").should("exist")
    cy.get("table").contains("button", "✕").click()
    cy.contains("td", "Lays Classic").should("not.exist")
  })
})

describe.skip("Sale invoices — real API", () => {
  it("GET /api/sale-invoices responds", () => {
    cy.loginAsManager()
    cy.request("/api/sale-invoices").then((res) => {
      expect(res.status).to.eq(200)
    })
  })
})
