import type { Page } from "@playwright/test";

/* Stub a network call with a JSON response — Playwright's answer to
 * cy.intercept(). Method-filtered so GET/POST to the same URL can be stubbed
 * separately; non-matching methods fall through to other handlers / the network. */
export async function stub(
  page: Page,
  method: string,
  url: string | RegExp,
  body: unknown,
  status = 200,
) {
  await page.route(url, (route) => {
    if (route.request().method() !== method) return route.fallback();
    return route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
}
