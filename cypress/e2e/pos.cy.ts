/// <reference types="cypress" />

/* ============================================================================
 *  POS TERMINAL — "/" New Sale Terminal   (Test plan §3 + §13 override)
 * ============================================================================
 *  Like /sales/new but stock is pulled PER GODAM: adding a product first calls
 *  /api/godams/item-stock to learn where the item is held, then creates a line
 *  capped at that godam's quantity.
 *
 *  Extra rule covered here: a line priced BELOW cost triggers a manager
 *  override modal → POST /api/verify-price-override before the sale can post.
 *  That's the price-override use case (§13.5) exercised end-to-end.
 * ========================================================================== */

const CUSTOMERS = {
  customers: [{ id: "c1", name: "Al-Madina", group_id: "g1", group_name: "Wholesale", display: "Al-Madina Store" }],
}
const INVENTORY = {
  items: [
    { id: "i1", name: "Lays Classic", sale_price: 10, cost_price: 8, no_of_units: 100,
      pieces_per_carton: 12, group_id: "g1", group_name: "Snacks" },
  ],
}
const GODAMS = { godams: [{ id: "gd1", name: "Main Store" }] }
const ITEM_STOCK = { entries: [{ godam_id: "gd1", godam_name: "Main Store", quantity: 100 }] }

function stubLoad() {
  cy.intercept("GET", "/api/customers", CUSTOMERS).as("customers")
  cy.intercept("GET", "/api/inventory", INVENTORY).as("inventory")
  cy.intercept("GET", "/api/godams", GODAMS).as("godams")
  cy.intercept("GET", "/api/godams/item-stock*", ITEM_STOCK).as("itemStock")
}

function selectCustomer() {
  cy.get('input[placeholder="Search customer..."]').type("Al-Madina")
  cy.contains("button", "Al-Madina Store").click()
  cy.contains("Selected: Al-Madina Store").should("be.visible")
}

function addProduct() {
  cy.get('input[placeholder="Search product..."]').type("Lays")
  cy.contains("button", "Lays Classic").click()
  cy.wait("@itemStock")
}

describe("POS terminal", () => {
  beforeEach(() => {
    cy.authAs("cashier") // POS is the cashier's main screen
    stubLoad()
    cy.visit("/")
    cy.wait(["@customers", "@inventory", "@godams"])
  })

  // §3.1
  it("renders the terminal with an empty cart (smoke)", () => {
    cy.contains("h1", "New Sale Terminal").should("be.visible")
    cy.contains("Cart is empty").should("be.visible")
  })

  // §3.3 — adding a product fetches godam stock and creates a line.
  it("adds a product as a line tied to a godam", () => {
    selectCustomer()
    addProduct()
    cy.contains("td", "Lays Classic").should("be.visible")
    cy.contains("Subtotal").parent().contains("Rs.120.00") // 10 × 12 carton price
  })

  // §3.7 — empty cart cannot check out.
  it("blocks checkout with an empty cart", () => {
    cy.intercept("POST", "/api/sale-invoices").as("create")
    selectCustomer()
    cy.contains("button", "Complete Sale & Invoice").click()
    cy.contains("Add at least one product").should("be.visible")
    cy.get("@create.all").should("have.length", 0)
  })

  // §3.8 — quantity beyond godam stock is rejected (need > available).
  it("rejects quantity exceeding godam stock", () => {
    cy.intercept("POST", "/api/sale-invoices").as("create")
    selectCustomer()
    addProduct()
    // 200 cartons × 12 = 2400 pieces > 100 available.
    cy.get("table").find('input[type=number]').first().clear().type("200")
    cy.contains("button", "Complete Sale & Invoice").click()
    cy.contains("only 100 pieces").should("be.visible")
    cy.get("@create.all").should("have.length", 0)
  })

  // §3.6 — HAPPY PATH checkout → POST sale-invoices → success toast.
  it("completes a sale", () => {
    cy.intercept("POST", "/api/sale-invoices", {
      statusCode: 200, body: { invoice: { id: "inv1", seq_no: "7" } },
    }).as("create")

    selectCustomer()
    addProduct()
    cy.contains("button", "Complete Sale & Invoice").click()

    cy.wait("@create").its("request.body.items.0").should("deep.include", {
      inventory_id: "i1", quantity: 1, unit_type: "cartons", sale_price: 10, godam_id: "gd1",
    })
    cy.contains("Sale #7 completed").should("be.visible")
  })

  /* §13.5 — BELOW-COST OVERRIDE. Drop the carton price to 60 → per-piece 5 <
   * cost 8 → override modal. Wrong passcode rejected; correct one lets the
   * sale post. Tests two stubbed responses from /api/verify-price-override. */
  it("requires a manager passcode for a below-cost sale", () => {
    cy.intercept("POST", "/api/sale-invoices", {
      statusCode: 200, body: { invoice: { id: "inv2", seq_no: "8" } },
    }).as("create")

    selectCustomer()
    addProduct()
    // Sale price input is the 2nd number field in the line row.
    cy.get("table").find('input[type=number]').eq(1).clear().type("60") // 60/12 = 5 < 8
    cy.contains("button", "Complete Sale & Invoice").click()

    // Modal appears; no sale posted yet.
    cy.contains("Below-Cost Sale").should("be.visible")
    cy.get("@create.all").should("have.length", 0)

    // Wrong passcode → rejected.
    cy.intercept("POST", "/api/verify-price-override", {
      statusCode: 401, body: { message: "Incorrect passcode" },
    }).as("verifyBad")
    cy.get('input[type=password]').type("0000")
    cy.contains("button", "Verify & Proceed").click()
    cy.wait("@verifyBad")
    cy.contains("Incorrect passcode").should("be.visible")
    cy.get("@create.all").should("have.length", 0)

    // Correct passcode → sale posts.
    cy.intercept("POST", "/api/verify-price-override", { statusCode: 200, body: { ok: true } }).as("verifyOk")
    cy.get('input[type=password]').type("1234")
    cy.contains("button", "Verify & Proceed").click()
    cy.wait("@verifyOk")
    cy.wait("@create")
    cy.contains("Sale #8 completed").should("be.visible")
  })
})
