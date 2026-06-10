/// <reference types="cypress" />

/* ============================================================================
 *  PRODUCTS / INVENTORY   (Test plan §7)
 * ============================================================================
 *  Two pages:
 *   • /inventory/view — read/adjust/rename existing stock (manager actions).
 *   • /inventory/add  — register new products + quick-edit (a.k.a. Manage
 *                        Products / Receive Stock).
 *
 *  KEY DOMAIN RULE worth a regression test: the UI works in CARTON prices, but
 *  the API stores PER-PIECE prices. The page divides by pieces_per_carton (ppc)
 *  before sending. We assert the converted payload — that math is exactly the
 *  kind of thing that silently breaks.
 *
 *  ⚠️ gap found: /inventory/view defines handleDelete() but no button calls it
 *  (same dead-code pattern as vendors). No delete UI → not covered here.
 * ========================================================================== */

const GROUPS = { groups: [{ id: "g1", name: "Snacks" }, { id: "g2", name: "Drinks" }] }
const VENDORS = { vendors: [{ id: "v1", name: "Lays Co", group_id: "g1" }] }

// ppc=12, per-piece sale=10 → carton sale = 120; per-piece cost=8 → carton 96.
const INVENTORY = {
  items: [
    { id: "i1", name: "Lays Classic", no_of_units: 100, sale_price: 10, cost_price: 8,
      group_id: "g1", group_name: "Snacks", pieces_per_carton: 12 },
    { id: "i2", name: "Pepsi 500ml", no_of_units: 50, sale_price: 50, cost_price: 40,
      group_id: "g2", group_name: "Drinks", pieces_per_carton: 1 },
  ],
}

describe("Inventory view — manager", () => {
  beforeEach(() => {
    cy.authAs("manager")
    cy.intercept("GET", "/api/groups", GROUPS).as("groups")
    cy.intercept("GET", "/api/inventory", INVENTORY).as("inv")
    cy.visit("/inventory/view")
    cy.wait("@inv")
  })

  // §7.1
  it("renders the product table (smoke)", () => {
    cy.contains("h1", "Products Inventory").should("be.visible")
    cy.contains("Lays Classic").should("be.visible")
    cy.contains("Pepsi 500ml").should("be.visible")
  })

  // Carton price = per-piece × ppc → 10 × 12 = 120 shown by default.
  it("shows carton prices by default and toggles to piece", () => {
    cy.contains("Lays Classic").parent("tr").within(() => {
      cy.contains("Rs.120.00") // sale per carton
    })
    cy.contains("button", "Piece").click()
    cy.contains("Lays Classic").parent("tr").within(() => {
      cy.contains("Rs.10.00") // sale per piece
    })
  })

  it("filters by search", () => {
    cy.get('input[placeholder="Search by name..."]').type("pepsi")
    cy.contains("Pepsi 500ml").should("be.visible")
    cy.contains("Lays Classic").should("not.exist")
  })

  /* §7.7 — PRICE ADJUST. Modal prefills carton price (120). We set 240 and
   * expect the API to receive PER-PIECE = 240 / 12 = 20. This locks the
   * carton→piece conversion. */
  it("adjusts sale price and sends per-piece value", () => {
    cy.intercept("POST", "/api/inventory/i1/price-adjust", {
      statusCode: 200, body: { message: "ok" },
    }).as("adjust")

    cy.contains("Lays Classic").parent("tr").contains("button", "Adjust Price").click()
    cy.get(".modal-box input[type=number]").clear().type("240")
    cy.contains("button", "Save Price").click()

    cy.wait("@adjust").its("request.body").should("deep.eq", { new_sale_price: 20 })
    cy.contains("Sale price updated").should("be.visible")
  })

  // §7.6 — rename via PATCH.
  it("renames a product", () => {
    cy.intercept("PATCH", "/api/inventory/i1", { statusCode: 200, body: { message: "ok" } }).as("rename")

    cy.contains("Lays Classic").parent("tr").contains("button", "Rename").click()
    cy.get(".modal-box input[type=text]").clear().type("Lays Salted")
    cy.contains("button", "Rename Product").click()

    cy.wait("@rename").its("request.body").should("deep.eq", { name: "Lays Salted" })
    cy.contains("Product renamed").should("be.visible")
  })

  // §7.7 sad — adjusting to 0 is blocked client-side with a toast (no request).
  it("rejects a zero/invalid new price", () => {
    cy.intercept("POST", "/api/inventory/i1/price-adjust").as("adjust")
    cy.contains("Lays Classic").parent("tr").contains("button", "Adjust Price").click()
    cy.get(".modal-box input[type=number]").clear().type("0")
    cy.contains("button", "Save Price").click()
    cy.contains("valid new sale price").should("be.visible")
    cy.get("@adjust.all").should("have.length", 0)
  })
})

/* §7.1 / §7.8 — cashier sees inventory read-only: no Actions column controls. */
describe("Inventory view — cashier (read-only)", () => {
  beforeEach(() => {
    cy.authAs("cashier")
    cy.intercept("GET", "/api/groups", GROUPS).as("groups")
    cy.intercept("GET", "/api/inventory", INVENTORY).as("inv")
    cy.visit("/inventory/view")
    cy.wait("@inv")
  })

  it("hides manager actions for cashier", () => {
    cy.contains("Lays Classic").should("be.visible") // can view
    cy.contains("button", "Adjust Price").should("not.exist")
    cy.contains("button", "Rename").should("not.exist")
  })
})

/* ============================================================================
 *  /inventory/add — register + edit products   (§7.2–7.5)
 * ========================================================================== */
describe("Inventory add — manager", () => {
  beforeEach(() => {
    cy.authAs("manager")
    cy.intercept("GET", "/api/groups", GROUPS).as("groups")
    cy.intercept("GET", "/api/vendors", VENDORS).as("vendors")
    cy.intercept("GET", "/api/inventory", INVENTORY).as("inv")
    cy.visit("/inventory/add")
    cy.wait("@inv")
  })

  // §7.1 smoke
  it("renders the manage products page", () => {
    cy.contains("h1", "Manage Products").should("be.visible")
    cy.contains("Register New Product").should("be.visible")
    cy.contains("2 Products").should("be.visible")
  })

  /* §7.3 — validation is toast-based and sequential: name → group → prices. */
  it("validates required fields with toasts", () => {
    cy.intercept("POST", "/api/inventory").as("create")
    // Empty name first.
    cy.contains("button", "Register New Product").click()
    cy.contains("Enter product name").should("be.visible")
    cy.get("@create.all").should("have.length", 0)

    // Name but no group.
    cy.get('input[placeholder="e.g. Lays Classic 30g"]').type("New Item")
    cy.contains("button", "Register New Product").click()
    cy.contains("Select a group").should("be.visible")
  })

  /* §7.2 — register new product. UI prices are per CARTON; payload must carry
   * PER-PIECE = carton / ppc. ppc=10, cost 1000→100, sale 1500→150. */
  it("registers a new product with per-piece conversion", () => {
    cy.intercept("POST", "/api/inventory", { statusCode: 200, body: { message: "ok" } }).as("create")

    cy.get('input[placeholder="e.g. Lays Classic 30g"]').type("Wavy Chips")
    cy.contains("label", "Group").parent().find("select").select("Snacks")
    cy.contains("label", "Pieces per Carton").parent().find("input").clear().type("10")
    cy.get('input[placeholder="What you pay per carton"]').type("1000")
    cy.get('input[placeholder="What you sell per carton"]').type("1500")
    cy.contains("button", "Register New Product").click()

    cy.wait("@create").its("request.body.items.0").should("deep.include", {
      name: "Wavy Chips", costPrice: 100, sale_price: 150, units: 0,
      group_id: "g1", pieces_per_carton: 10,
    })
    cy.contains("Product added").should("be.visible")
  })

  /* §7.4/7.5 — quick-edit existing product → PATCH with converted prices.
   * Selecting Lays (ppc 12, sale 10 → carton 120) then saving sends sale/12. */
  it("edits an existing product via PATCH", () => {
    cy.intercept("PATCH", "/api/inventory/i1", { statusCode: 200, body: { message: "ok" } }).as("update")

    cy.contains("td", "Lays Classic").parent("tr").contains("button", "Edit").click()
    cy.contains("button", "Update Product Configuration").click()

    cy.wait("@update").its("request.body").should("deep.include", {
      name: "Lays Classic", pieces_per_carton: 12, sale_price: 10, cost_price: 8,
    })
    cy.contains("Product updated").should("be.visible")
  })
})

describe.skip("Inventory — real API", () => {
  it("GET /api/inventory returns items", () => {
    cy.loginAsManager()
    cy.request("/api/inventory").then((res) => {
      expect(res.status).to.eq(200)
      expect(res.body).to.have.property("items")
    })
  })
})
