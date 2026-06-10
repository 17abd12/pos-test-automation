/// <reference types="cypress" />

/* ============================================================================
 *  REVENUE REPORT — /reports/revenue   (Test plan §14)
 * ============================================================================
 *  Pick a month range (+ optional group) → Load Report → GET /api/reports/
 *  revenue. Renders a monthly P&L table with a grand-total row, party filter,
 *  and stat cards. Nothing loads until "Load Report" is clicked.
 * ========================================================================== */

const GROUPS = { groups: [{ id: "g1", name: "Snacks" }] }

const REPORT = {
  months: [
    {
      month: "2026-06", month_label: "Jun 2026",
      revenue: 1000, cogs: 600, gross_profit: 400, expenses: 100, net_profit: 300,
      pieces: 50, cartons: 5,
      parties: [
        { name: "Al-Madina", revenue: 1000, cogs: 600, gross_profit: 400, pieces: 50, cartons: 5 },
      ],
    },
  ],
}

describe("Revenue report", () => {
  beforeEach(() => {
    cy.authAs("manager")
    cy.intercept("GET", "/api/groups", GROUPS).as("groups")
    cy.visit("/reports/revenue")
    cy.wait("@groups")
  })

  // §14.1
  it("renders the report page with filters (smoke)", () => {
    cy.contains("h1", "Revenue Report").should("be.visible")
    cy.contains("button", "Load Report").should("be.visible")
    // Nothing loaded yet → no summary table.
    cy.contains("Monthly Summary").should("not.exist")
  })

  // §14.2 — load report → table + grand totals compute from stubbed months.
  it("loads and displays revenue totals", () => {
    cy.intercept("GET", "/api/reports/revenue*", REPORT).as("report")
    cy.contains("button", "Load Report").click()
    cy.wait("@report")

    cy.contains("Monthly Summary").should("be.visible")
    cy.contains("Jun 2026").should("be.visible")
    cy.contains("Grand Total").should("be.visible")
    // Stat cards.
    cy.contains("Total Revenue").parent().contains("Rs.1,000.00")
    cy.contains("Net Profit").parent().contains("Rs.300.00")
  })

  // §14.2 — party drill-down expands the month row.
  it("expands a month to show party breakdown", () => {
    cy.intercept("GET", "/api/reports/revenue*", REPORT).as("report")
    cy.contains("button", "Load Report").click()
    cy.wait("@report")

    // Party row is hidden in the TABLE until expanded (the name also appears as
    // a Party Filter chip, so scope the assertion to a table cell).
    cy.get("table").find("td").contains("Al-Madina").should("not.exist")
    cy.contains("tr", "Jun 2026").contains("button", "Parties").click()
    cy.get("table").find("td").contains("Al-Madina").should("be.visible")
  })

  // §14.7 sad — server error surfaces an inline message, no crash.
  it("shows an error when the report fails", () => {
    cy.intercept("GET", "/api/reports/revenue*", {
      statusCode: 500, body: { message: "Report failed to generate" },
    }).as("report")
    cy.contains("button", "Load Report").click()
    cy.wait("@report")
    cy.contains("Report failed to generate").should("be.visible")
  })
})

describe.skip("Revenue report — real API", () => {
  it("GET /api/reports/revenue responds", () => {
    cy.loginAsManager()
    cy.request("/api/reports/revenue?from=2026-01-01&to=2026-12-31").then((res) => {
      expect(res.status).to.eq(200)
    })
  })
})
