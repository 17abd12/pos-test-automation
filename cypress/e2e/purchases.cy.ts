/// <reference types="cypress" />

/* ============================================================================
 *  PURCHASES — /purchases/new   (Test plan §9)
 * ============================================================================
 *  Stock-IN path (mirror of sale invoices). Flow:
 *    1. pick a GROUP (suppliers + products are filtered by it; both stay
 *       disabled until a group is chosen)
 *    2. pick a supplier from that group
 *    3. add received products → line items (default unit cartons)
 *    4. submit → POST /api/purchase-invoices → "Purchase Recorded!" screen
 *
 *  Same carton→piece cost conversion as sales: cost entered per carton, sent
 *  per piece. Plus a separate "Cash / Wild Purchase" modal → /api/cash-purchases.
 * ========================================================================== */

const GROUPS = { groups: [{ id: "g1", name: "Snacks" }] }
const VENDORS = {
  vendors: [{ id: "v1", name: "Nestle", group_id: "g1", group_name: "Snacks", display: "Nestle (Snacks)" }],
}
const INVENTORY = {
  items: [
    { id: "i1", name: "Lays Classic", cost_price: 8, no_of_units: 0, pieces_per_carton: 12,
      group_id: "g1", group_name: "Snacks" },
  ],
}
const GODAMS = { godams: [{ id: "gd1", name: "Main Store", location: "Hall A" }] }
const CUSTOMERS = { customers: [] as unknown[] }

function stubLoad() {
  cy.intercept("GET", "/api/groups", GROUPS).as("groups")
  cy.intercept("GET", "/api/vendors", VENDORS).as("vendors")
  cy.intercept("GET", "/api/inventory", INVENTORY).as("inventory")
  cy.intercept("GET", "/api/godams", GODAMS).as("godams")
  cy.intercept("GET", "/api/customers", CUSTOMERS).as("customers")
}

function pickGroupAndVendor() {
  cy.contains(".card", "Select Group").find("select").select("Snacks")
  cy.contains(".card", "Select Supplier").find("select").select("Nestle")
  cy.contains("Selected: Nestle (Snacks)").should("be.visible")
}

function addProduct() {
  cy.get('input[placeholder="Search product..."]').type("Lays")
  cy.contains("li", "Lays Classic").click()
}

describe("Purchases — new (manager)", () => {
  beforeEach(() => {
    cy.authAs("manager")
    stubLoad()
    cy.visit("/purchases/new")
    cy.wait(["@groups", "@vendors", "@inventory", "@godams"])
  })

  // §9.1
  it("renders the record purchase page (smoke)", () => {
    cy.contains("h1", "Record a Purchase").should("be.visible")
  })

  // §9.2 — supplier + product entry stays disabled until a group is chosen.
  it("disables product entry until a group is selected", () => {
    cy.get('input[placeholder="Select a group first"]').should("be.disabled")
    cy.contains(".card", "Select Group").find("select").select("Snacks")
    cy.get('input[placeholder="Search product..."]').should("not.be.disabled")
  })

  // §9.5 sad — no group selected.
  it("requires a group", () => {
    cy.intercept("POST", "/api/purchase-invoices").as("create")
    cy.get('button[type=submit]').click()
    cy.contains("Select a group first").should("be.visible")
    cy.get("@create.all").should("have.length", 0)
  })

  // §9.5 sad — group but no supplier.
  it("requires a supplier", () => {
    cy.intercept("POST", "/api/purchase-invoices").as("create")
    cy.contains(".card", "Select Group").find("select").select("Snacks")
    cy.get('button[type=submit]').click()
    cy.contains("Select a supplier").should("be.visible")
    cy.get("@create.all").should("have.length", 0)
  })

  /* §9.3 — HAPPY PATH. Cost per carton = 8 × 12 = 96; payload sends per-piece
   * cost 96/12 = 8. Success screen confirms stock update. */
  it("records a purchase with per-piece cost conversion", () => {
    cy.intercept("POST", "/api/purchase-invoices", {
      statusCode: 200, body: { purchase: { id: "p1" } },
    }).as("create")

    pickGroupAndVendor()
    addProduct()
    cy.contains("Total: Rs.96.00").should("be.visible")
    cy.get('button[type=submit]').click()

    cy.wait("@create").then(({ request }) => {
      expect(request.body).to.deep.include({ vendor_id: "v1", payment: "Credit" })
      expect(request.body.items[0]).to.deep.include({
        inventory_id: "i1", quantity: 1, unit_type: "cartons", cost_price: 8, godam_id: "gd1",
      })
    })
    cy.contains("Purchase Recorded!").should("be.visible")
  })
})

/* §9.4 — cash / wild purchase via its modal → /api/cash-purchases. */
describe("Purchases — cash purchase modal", () => {
  beforeEach(() => {
    cy.authAs("manager")
    stubLoad()
    cy.visit("/purchases/new")
    cy.wait("@groups")
    cy.contains("button", "Cash / Wild Purchase").click()
  })

  it("validates description and amount", () => {
    cy.intercept("POST", "/api/cash-purchases").as("cash")
    // Scope to .modal-box: the page's bottom "Record Purchase" submit also
    // matches and sits behind the modal backdrop.
    cy.get(".modal-box").contains("button", "Record Purchase").click()
    cy.contains("Description required").should("be.visible")
    cy.get("@cash.all").should("have.length", 0)
  })

  it("records a cash purchase", () => {
    cy.intercept("POST", "/api/cash-purchases", { statusCode: 200, body: { ok: true } }).as("cash")

    cy.get('input[placeholder="e.g. Packing tape, Office supplies"]').type("Packing tape")
    cy.get('input[placeholder="0.00"]').first().type("500")
    cy.get(".modal-box").contains("button", "Record Purchase").click()

    cy.wait("@cash").its("request.body").should("deep.include", {
      description: "Packing tape", amount: 500, payment: "Cash",
    })
    cy.contains("Cash purchase recorded").should("be.visible")
  })
})

describe.skip("Purchases — real API", () => {
  it("GET /api/purchase-invoices responds", () => {
    cy.loginAsManager()
    cy.request("/api/purchase-invoices").then((res) => {
      expect(res.status).to.eq(200)
    })
  })
})
