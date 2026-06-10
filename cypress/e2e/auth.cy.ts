/// <reference types="cypress" />

/* ============================================================================
 *  AUTH & SESSION — route protection, roles, logout
 * ============================================================================
 *  Covers test plan §1 (Auth & Session) + §2 (role-based nav).
 *
 *  TWO HALVES of this file:
 *   A) PROTECTION tests — need NO database. They prove that WITHOUT a token,
 *      middleware.ts blocks access. Only `npm run dev` required.
 *   B) SESSION tests — need a REAL seeded user (login/logout/role nav). Gated
 *      in `describe.skip` until you provide creds (cypress.env.json).
 *
 *  WHY split: protection logic is pure middleware (deterministic, no data),
 *  so it should always run in CI. Anything needing a real account is opt-in.
 * ========================================================================== */

// Pages that must require auth. Add more as the app grows.
const PROTECTED_PAGES = [
  "/",
  "/sales",
  "/sales/new",
  "/customers",
  "/vendors",
  "/inventory/view",
  "/purchases",
  "/payments",
  "/expenses",
  "/warehouse",
  "/groups",
  "/reports/revenue",
]

// Protected API routes (middleware returns 401 JSON instead of redirecting).
const PROTECTED_APIS = [
  "/api/customers",
  "/api/vendors",
  "/api/inventory",
  "/api/sale-invoices",
]

describe("Auth — route protection (no DB needed)", () => {
  // No login here on purpose: we are the "logged-out attacker".
  beforeEach(() => {
    cy.clearCookies() // guarantee no token
  })

  /* §1.7 — every protected PAGE bounces a logged-out user to /login.
   * data-driven test: one assertion, looped over many routes. Keeps coverage
   * wide without copy-pasting an it() per page. */
  PROTECTED_PAGES.forEach((path) => {
    it(`redirects ${path} to /login when logged out`, () => {
      cy.visit(path)
      cy.location("pathname").should("eq", "/login")
    })
  })

  /* §1.9 — protected APIs return 401 JSON (not a redirect) for no token.
   * failOnStatusCode:false stops cy.request from failing the test on a 4xx —
   * here the 401 IS the expected result, so we assert it ourselves. */
  PROTECTED_APIS.forEach((api) => {
    it(`returns 401 for ${api} when logged out`, () => {
      cy.request({ url: api, failOnStatusCode: false }).then((res) => {
        expect(res.status).to.eq(401)
        expect(res.body).to.have.property("message", "Unauthorized")
      })
    })
  })

  // §1.1 — /login itself is public and reachable while logged out.
  it("allows /login while logged out", () => {
    cy.visit("/login")
    cy.location("pathname").should("eq", "/login")
    cy.get('[data-cy="submit"]').should("be.visible")
  })

  /* §1.11 — a garbage/forged token must be treated as logged out. We plant a
   * fake cookie, then a protected page should still redirect to /login
   * (middleware verifyJwt fails → not authenticated). */
  it("treats an invalid token as logged out", () => {
    cy.setCookie("token", "not-a-real-jwt")
    cy.visit("/")
    cy.location("pathname").should("eq", "/login")
  })

  /* §1.12 — /api/me. NOTE: middleware.ts is NOT in the public list for /api/me,
   * so a request with NO token is stopped by middleware with 401 BEFORE the
   * handler's {role:null} branch can run. The role:null path only applies once
   * middleware passes (a valid token). So the logged-out contract is 401. */
  it("/api/me returns 401 without a token", () => {
    cy.request({ url: "/api/me", failOnStatusCode: false }).then((res) => {
      expect(res.status).to.eq(401)
    })
  })
})


/* ============================================================================
 *  SESSION tests — need a REAL seeded account. Remove `.skip` (or change to
 *  `.only`) once cypress.env.json has MANAGER and CASHIER creds.
 * ========================================================================== */
describe.skip("Auth — real session (needs seeded users)", () => {
  // §1.8 — a logged-in user hitting /login is redirected to the app root.
  it("redirects /login to / when already authenticated", () => {
    cy.loginAsManager()
    cy.visit("/login")
    cy.location("pathname").should("eq", "/")
  })

  // §1.10 — logout clears the cookie; next protected visit redirects to /login.
  it("logout ends the session", () => {
    cy.loginAsManager()
    cy.visit("/")
    cy.location("pathname").should("eq", "/")

    // Use the UI logout button (tests the real wiring).
    cy.contains("button", "Logout").click()
    cy.location("pathname").should("eq", "/login")

    // Session truly gone: going back to a protected page bounces again.
    cy.visit("/")
    cy.location("pathname").should("eq", "/login")
  })

  /* §2.1 / §2.2 — ROLE-BASED NAV. Manager sees finance/export controls;
   * cashier does not. This is authorization enforced in the UI layer. */
  it("manager sees Finance + Export controls in the navbar", () => {
    cy.loginAsManager()
    cy.visit("/")
    cy.contains("Finance").should("be.visible")
    cy.contains("Export").should("be.visible")
  })

  it("cashier does NOT see Finance/Export controls", () => {
    cy.loginAsCashier()
    cy.visit("/")
    cy.contains("Finance").should("not.exist")
    cy.contains("Export").should("not.exist")
    // Cashier still sees their allowed links.
    cy.contains("a", "Suppliers").should("be.visible")
  })
})
