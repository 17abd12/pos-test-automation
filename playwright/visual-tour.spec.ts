import { test } from "@playwright/test";
import { authAs } from "./utils/auth";

/* ============================================================================
 *  VISUAL TOUR — generates showcase screenshots into docs/screenshots/.
 * ============================================================================
 *  Not an assertion spec. It logs in (minted manager token), stubs every data
 *  API to an empty shape so pages render instantly offline, then screenshots
 *  each screen. Run: `npm run tour`. Commit the PNGs for the README gallery.
 * ========================================================================== */

const PAGES: { path: string; name: string }[] = [
  { path: "/", name: "01-pos-terminal" },
  { path: "/sales/new", name: "02-sale-invoice" },
  { path: "/customers", name: "03-customers" },
  { path: "/vendors", name: "04-vendors" },
  { path: "/inventory/view", name: "05-inventory" },
  { path: "/inventory/add", name: "06-manage-products" },
  { path: "/purchases/new", name: "07-purchase" },
  { path: "/payments", name: "08-payments" },
  { path: "/expenses", name: "09-expenses" },
  { path: "/warehouse", name: "10-warehouse" },
  { path: "/groups", name: "11-groups" },
  { path: "/reports/revenue", name: "12-revenue-report" },
];

// Empty-but-valid payloads so every page renders without a DB.
function emptyFor(url: string): unknown {
  if (url.includes("/api/groups")) return { groups: [] };
  if (url.includes("/api/customers")) return { customers: [] };
  if (url.includes("/api/vendors")) return { vendors: [] };
  if (url.includes("/api/inventory")) return { items: [] };
  if (url.includes("/api/godams")) return { godams: [] };
  if (url.includes("/api/payments")) return { payments: [] };
  if (url.includes("/api/supplier-expenses")) return { expenses: [] };
  if (url.includes("/api/account")) return { account: { netAccount: 0 } };
  return {};
}

test("login screen", async ({ context, page }) => {
  await context.clearCookies(); // logged-out so /login doesn't redirect to /
  await page.goto("/login");
  await page.screenshot({ path: "docs/screenshots/00-login.png", fullPage: true });
});

test("app pages tour", async ({ context, page }) => {
  await authAs(context, "manager");
  await page.route("**/api/**", (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const url = route.request().url();
    if (url.includes("/api/me")) return route.fallback(); // real → returns manager role
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(emptyFor(url)) });
  });

  for (const p of PAGES) {
    await page.goto(p.path);
    await page.waitForTimeout(400); // let the page settle
    await page.screenshot({ path: `docs/screenshots/${p.name}.png`, fullPage: true });
  }
});
