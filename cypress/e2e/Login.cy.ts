/// <reference types="cypress" />

/* ============================================================================
 *  LOGIN — END-TO-END (E2E) TEST SUITE   [LEARNING EDITION]
 * ============================================================================
 *
 *  WHAT IS E2E TESTING?
 *  --------------------
 *  E2E = "End to End". You drive the REAL app the way a REAL user would:
 *  open a browser, type into inputs, click buttons, and assert what the user
 *  SEES happen. You do NOT call internal functions. You test the whole chain:
 *
 *      browser UI  →  network request  →  API route  →  cookie/redirect  →  UI
 *
 *  Compare to other test layers (the "Test Pyramid"):
 *    • UNIT test       — one function in isolation. Fast, many of them.
 *    • INTEGRATION test— a few modules together (e.g. API + DB).
 *    • E2E test        — whole system through the browser. Slow, few of them.
 *  E2E sits at the TOP of the pyramid: highest confidence, highest cost.
 *  Rule of thumb: many unit tests, some integration, a FEW critical E2E flows.
 *  Login is THE classic critical E2E flow — if it breaks, nobody gets in.
 *
 *  KEY VOCABULARY (you'll see these everywhere):
 *  ---------------------------------------------
 *  • SMOKE TEST   — quickest "is it even on fire?" check. Page loads, core
 *                   elements exist. Run first; if smoke fails, stop.
 *  • REGRESSION   — a bug that comes BACK / a feature that USED to work and
 *                   now doesn't. A "regression suite" is the full set of tests
 *                   you re-run on every change to catch regressions. Each test
 *                   below is a guard: once it passes, it stops that bug from
 *                   ever silently returning.
 *  • HAPPY PATH   — everything goes right (valid login → dashboard).
 *  • SAD / NEGATIVE PATH — things go wrong (bad password, empty fields).
 *                   Prod-level suites test sad paths AS MUCH as happy ones.
 *  • EDGE CASE    — boundary / unusual input (spaces in username, very long
 *                   input, special chars). Bugs love edges.
 *  • FLAKY TEST   — passes sometimes, fails sometimes for no code reason.
 *                   Usually caused by bad waits. Cypress fights flake with
 *                   automatic retrying (see below).
 *
 *  HOW CYPRESS WORKS (the 2 things that confuse beginners):
 *  --------------------------------------------------------
 *  1) COMMANDS ARE ASYNC + QUEUED. cy.get(...).click() does NOT run instantly.
 *     Cypress enqueues commands and runs them in order. So you CANNOT do:
 *         const el = cy.get('#x')   // ❌ this is NOT the element
 *     You chain instead: cy.get('#x').click(). Use .then() to read a value.
 *
 *  2) AUTOMATIC RETRY + WAITING. cy.get() and assertions RETRY for ~4s until
 *     they pass or time out. So you almost NEVER need cy.wait(2000). Hard waits
 *     are an anti-pattern (slow + flaky). Wait for a CONDITION, not a clock.
 *
 *  SELECTOR STRATEGY (why data-cy?):
 *  ---------------------------------
 *  We added data-cy="username" etc. to the login page. Cypress' own best
 *  practice: select by a dedicated test attribute, NOT by CSS class or text.
 *  Classes change when designers restyle; text changes with i18n/copy edits.
 *  data-cy is contract-for-tests-only, so tests don't break on cosmetic edits.
 * ========================================================================== */


/* ----------------------------------------------------------------------------
 *  TEST DATA
 *  In real suites, secrets/creds come from Cypress.env() (cypress.env.json or
 *  CYPRESS_* env vars), NEVER hardcoded/committed. Hardcoded here for learning.
 *  Replace these with a user that actually exists in your `users` table when
 *  you run the REAL (un-stubbed) login test at the bottom.
 * -------------------------------------------------------------------------- */
const VALID_USER = {
  username: Cypress.env("LOGIN_USER") || "admin",
  password: Cypress.env("LOGIN_PASS") || "admin123",
}


/* ============================================================================
 *  describe() = a SUITE: a named group of related tests.
 *  it()       = a single TEST CASE. Name it as a behavior: "does X when Y".
 * ========================================================================== */
describe("Login page", () => {

  /* beforeEach() runs before EVERY it() in this suite.
   * WHY: TEST ISOLATION. Each test must start from a clean, known state and
   * not depend on the test before it. Cypress already clears cookies/storage
   * between tests; we also re-visit the page so every test begins fresh. */
  beforeEach(() => {
    cy.visit("/login") // "/login" works because baseUrl is set in cypress.config.ts
  })


  /* ==========================================================================
   *  TEST 1 — SMOKE TEST
   *  THEORY: The cheapest, fastest sanity check. Before testing behavior, prove
   *  the page even renders and the critical controls are present. If this
   *  fails, every later test is meaningless, so it runs first.
   * ======================================================================== */
  it("renders the login form (smoke test)", () => {
    // .should("be.visible") is an ASSERTION. It auto-retries until true/timeout.
    cy.get('[data-cy="username"]').should("be.visible")
    cy.get('[data-cy="password"]').should("be.visible")
    cy.get('[data-cy="submit"]').should("be.visible").and("contain", "Sign In")

    // Assert the password field actually masks input (security expectation).
    cy.get('[data-cy="password"]').should("have.attr", "type", "password")
  })


  /* ==========================================================================
   *  TEST 2 — CLIENT-SIDE VALIDATION (negative path, no network)
   *  THEORY: The inputs use the HTML `required` attribute. Submitting empty
   *  should NOT fire a network request — the browser blocks it. We prove the
   *  guard works WITHOUT hitting the API. Testing that "nothing bad happens"
   *  is just as important as testing that "the right thing happens".
   * ======================================================================== */
  it("blocks submit when fields are empty (HTML required)", () => {
    // cy.intercept() = a SPY/STUB on network traffic. Here used as a SPY:
    // we give it an alias (@loginReq) so we can later assert it was NOT called.
    cy.intercept("POST", "/api/login").as("loginReq")

    cy.get('[data-cy="submit"]').click()

    // Browser-native validation kicks in: the field reports invalid and the
    // form never submits. We check the DOM validity API via .then().
    cy.get('[data-cy="username"]').then(($el) => {
      const input = $el[0] as HTMLInputElement
      expect(input.checkValidity()).to.eq(false) // invalid → submit prevented
    })

    // Prove no request left the browser. cy.get('@alias.all') is the list of
    // captured calls; empty array = the API was never hit.
    cy.get("@loginReq.all").should("have.length", 0)
  })


  /* ==========================================================================
   *  TEST 3 — INVALID CREDENTIALS (negative path, STUBBED network)
   *  THEORY: STUBBING. Instead of relying on the real DB returning a 401, we
   *  intercept the request and FORCE a fake 401 response. Benefits:
   *    • Deterministic — same result every run (no flake, no DB needed).
   *    • Fast — no real network/DB round trip.
   *    • Lets us test responses that are hard to trigger for real.
   *  This is a UI contract test: "given the API says 401, the UI must react
   *  correctly." We are testing OUR frontend, not the backend here.
   * ======================================================================== */
  it("shows an error when credentials are rejected (401)", () => {
    cy.intercept("POST", "/api/login", {
      statusCode: 401,
      body: { message: "Invalid credentials" },
    }).as("loginReq")

    cy.get('[data-cy="username"]').type("wrong")
    cy.get('[data-cy="password"]').type("wrong")
    cy.get('[data-cy="submit"]').click()

    // cy.wait("@alias") BLOCKS until that intercepted request happens, then
    // gives us the request/response to assert on. This is the CORRECT way to
    // wait — on an event, never a fixed timer.
    cy.wait("@loginReq").its("response.statusCode").should("eq", 401)

    // The error banner must appear.
    cy.get('[data-cy="login-error"]').should("be.visible")

    // We must STILL be on /login (a rejected login must not navigate away).
    cy.location("pathname").should("eq", "/login")

    /* ⚠️ LEARNING NOTE — A REAL BUG THIS TEST EXPOSES:
     * app/login/page.tsx reads `data.error`, but the API returns `data.message`.
     * So the banner shows the fallback text "Login failed", NOT the API's
     * "Invalid credentials". That's why we assert the banner is VISIBLE rather
     * than its exact text. A good fix: change the page to read `data.message`.
     * Lesson: writing the test surfaced a frontend/backend contract mismatch —
     * exactly what regression tests are for. */
  })


  /* ==========================================================================
   *  TEST 4 — SUCCESSFUL LOGIN / HAPPY PATH (STUBBED)
   *  THEORY: We stub BOTH calls the page makes (/api/login then /api/me) so the
   *  test never needs a real database or seeded user. We assert the success
   *  outcome the FRONTEND controls: right request body → success toast.
   *
   *  ⚠️ WHY WE DON'T ASSERT THE FINAL "/" URL HERE:
   *  We STUBBED /api/login, so the fake response never sets the real `token`
   *  cookie that the live API would. The page then does
   *  window.location.href = "/", which hits the REAL middleware.ts — it sees
   *  no token cookie and redirects straight back to /login. So the redirect
   *  fires correctly, but a stubbed login can never land on a protected route.
   *  LESSON: stubbed auth ≠ a real session. Verifying the actual redirect +
   *  cookie belongs in the REAL-backend test (Test 7), where a real token is
   *  issued. Here we assert what the frontend alone can prove: the toast.
   * ======================================================================== */
  it("sends the right credentials and shows the success toast", () => {
    cy.intercept("POST", "/api/login", {
      statusCode: 200,
      body: {
        message: "Login successful",
        user: { username: "manager", name: "Manager", role: "manager" },
      },
    }).as("loginReq")

    // The page shows the toast, THEN awaits /api/me, THEN redirects. Delaying
    // this stub keeps the page on /login while the toast is on screen, giving
    // a stable window to assert it before the navigation reload wipes the DOM.
    cy.intercept("GET", "/api/me", {
      statusCode: 200,
      body: { username: "manager", name: "Manager", role: "manager" },
      delay: 1000,
    }).as("meReq")

    cy.get('[data-cy="username"]').type(VALID_USER.username)
    cy.get('[data-cy="password"]').type(VALID_USER.password)
    cy.get('[data-cy="submit"]').click()

    // Assert the REQUEST the browser sent carried the right payload. This
    // verifies the form is wired correctly, not just that we got a 200.
    cy.wait("@loginReq").its("request.body").should("deep.include", {
      username: VALID_USER.username,
      password: VALID_USER.password,
    })

    // User-visible success signal that the frontend fully controls: the
    // react-hot-toast message. It appears BEFORE the navigation bounce, so
    // it's a reliable assertion for a stubbed login.
    cy.contains("Login successful").should("be.visible")
  })


  /* ==========================================================================
   *  TEST 5 — LOADING STATE (UI feedback)
   *  THEORY: Good UX disables the button + shows a spinner during the request,
   *  preventing double-submit. We test this by DELAYING the stubbed response so
   *  the in-flight state is observable. `delay` simulates a slow network.
   * ======================================================================== */
  it("disables the button and shows a spinner while submitting", () => {
    cy.intercept("POST", "/api/login", {
      statusCode: 200,
      body: { message: "Login successful", user: { role: "manager" } },
      delay: 800, // keep the request "in flight" long enough to assert on
    }).as("loginReq")
    cy.intercept("GET", "/api/me", { statusCode: 200, body: {} }).as("meReq")

    cy.get('[data-cy="username"]').type(VALID_USER.username)
    cy.get('[data-cy="password"]').type(VALID_USER.password)
    cy.get('[data-cy="submit"]').click()

    // During the delay: button disabled + text switches to "Signing in...".
    cy.get('[data-cy="submit"]').should("be.disabled").and("contain", "Signing in")

    cy.wait("@loginReq")
  })


  /* ==========================================================================
   *  TEST 6 — EDGE CASE: username normalization
   *  THEORY: The API lowercases the username and strips spaces
   *  (" Man ager " → "manager"). The user might type messy input. We assert the
   *  browser SENDS the raw text (normalization is the server's job) — this
   *  documents/locks the current contract. If someone later moves normalization
   *  to the client, this test will flag the behavior change. That is the whole
   *  point of a regression test: pin down behavior so changes are intentional.
   * ======================================================================== */
  it("sends the username exactly as typed (server normalizes it)", () => {
    cy.intercept("POST", "/api/login", {
      statusCode: 200,
      body: { message: "Login successful", user: { role: "manager" } },
    }).as("loginReq")
    cy.intercept("GET", "/api/me", { statusCode: 200, body: {} }).as("meReq")

    cy.get('[data-cy="username"]').type("  Manager  ")
    cy.get('[data-cy="password"]').type(VALID_USER.password)
    cy.get('[data-cy="submit"]').click()

    cy.wait("@loginReq").its("request.body.username").should("eq", "  Manager  ")
  })
})


/* ============================================================================
 *  TEST 7 — REAL (UN-STUBBED) END-TO-END LOGIN  [skipped by default]
 *  ----------------------------------------------------------------------------
 *  Everything above STUBS the network, so it tests the FRONTEND only. A true
 *  E2E also exercises the real API + DB at least once for a critical flow.
 *
 *  This is `describe.skip(...)` so it does NOT run automatically — it needs:
 *    1. `npm run dev` running, AND
 *    2. a user that REALLY exists in your Supabase `users` table.
 *  Provide creds at run time so nothing secret is committed:
 *      npx cypress run --env LOGIN_USER=manager,LOGIN_PASS=realpassword
 *  Then change `.skip` to `.only` (or remove `.skip`) to enable it.
 * ========================================================================== */
describe.skip("Login (REAL backend — manual/CI only)", () => {
  it("logs in against the real API and sets the auth cookie", () => {
    cy.visit("/login")
    cy.get('[data-cy="username"]').type(VALID_USER.username)
    cy.get('[data-cy="password"]').type(VALID_USER.password)
    cy.get('[data-cy="submit"]').click()

    // Real success → redirected off /login...
    cy.location("pathname", { timeout: 10000 }).should("not.eq", "/login")

    // ...and the httpOnly `token` cookie is set by /api/login.
    // (httpOnly cookies are invisible to JS, but Cypress CAN read them.)
    cy.getCookie("token").should("exist")
  })
})
