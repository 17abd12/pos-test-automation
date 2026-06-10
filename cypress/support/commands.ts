/// <reference types="cypress" />

/* ============================================================================
 *  CUSTOM COMMANDS  — reusable test building blocks
 * ============================================================================
 *  THEORY: A custom command extends the `cy.*` API. Use it for actions you
 *  repeat across many specs. The golden example is LOGIN: almost every page is
 *  behind auth, so re-typing the form in every test would be slow and noisy.
 *
 *  TWO WAYS TO LOG IN IN E2E:
 *  --------------------------
 *  1) UI login — type username/password, click submit. Tests the login SCREEN.
 *     Do this ONCE (in Login.cy.ts). Slow; don't repeat it everywhere.
 *  2) PROGRAMMATIC login — POST straight to /api/login with cy.request().
 *     The real API issues the real httpOnly `token` cookie, so the session is
 *     genuine and protected routes work. Fast, no UI. Use this as setup in
 *     every OTHER spec. This is Cypress' official recommended pattern.
 * ========================================================================== */

// Make TypeScript aware of our new commands (autocomplete + type-checking).
declare global {
  namespace Cypress {
    interface Chainable {
      /** Programmatic login via the real API. Sets the auth cookie. */
      login(username?: string, password?: string): Chainable<void>
      /** Convenience: log in as the seeded manager account. */
      loginAsManager(): Chainable<void>
      /** Convenience: log in as the seeded cashier account. */
      loginAsCashier(): Chainable<void>
      /** Forge a session for the given role WITHOUT a DB user (mints a JWT). */
      authAs(role?: "manager" | "cashier"): Chainable<void>
      /** Select a DOM element by its data-cy attribute. */
      dataCy(value: string): Chainable<JQuery<HTMLElement>>
    }
  }
}

/* PROGRAMMATIC LOGIN.
 * cy.request() makes a real HTTP call OUTSIDE the browser app, but Cypress
 * automatically stores any Set-Cookie it returns into the browser's cookie
 * jar. So after this runs, cy.visit("/anything") is authenticated. */
Cypress.Commands.add("login", (username?: string, password?: string) => {
  const user = username ?? Cypress.env("LOGIN_USER")
  const pass = password ?? Cypress.env("LOGIN_PASS")

  // cy.session() CACHES the login across tests in the same spec: the body runs
  // once, then Cypress restores cookies for later tests instead of re-logging
  // in. Huge speed win in big suites. Keyed by the args so manager/cashier
  // sessions stay separate.
  cy.session([user, pass], () => {
    cy.request({
      method: "POST",
      url: "/api/login",
      body: { username: user, password: pass },
    })
      .its("status")
      .should("eq", 200)
  })
})

Cypress.Commands.add("loginAsManager", () => {
  cy.login(Cypress.env("MANAGER_USER"), Cypress.env("MANAGER_PASS"))
})

Cypress.Commands.add("loginAsCashier", () => {
  cy.login(Cypress.env("CASHIER_USER"), Cypress.env("CASHIER_PASS"))
})

/* FORGE A SESSION (no DB needed). Asks the Node-side mintToken task for a valid
 * JWT, then plants it as the `token` cookie so middleware.ts treats us as
 * logged in. Use in beforeEach for protected-PAGE specs you want to run offline
 * with stubbed data. (For testing the real login screen, use cy.login instead.) */
Cypress.Commands.add("authAs", (role: "manager" | "cashier" = "manager") => {
  cy.task("mintToken", { role }).then((token) => {
    cy.setCookie("token", token as string)
  })
})

// Sugar so specs read cy.dataCy("submit") instead of the verbose attr selector.
Cypress.Commands.add("dataCy", (value: string) => {
  return cy.get(`[data-cy="${value}"]`)
})

export {}
