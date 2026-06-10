import { test, expect, type Page } from "@playwright/test";
import { authAs } from "./utils/auth";
import { stub } from "./utils/stub";

/* SUPPLIER EXPENSES — port of cypress/e2e/expenses.cy.ts (test plan §12). */

const GROUPS = { groups: [{ id: "g1", name: "Snacks" }] };
const VENDORS = { vendors: [{ id: "v1", name: "Nestle", group_id: "g1" }] };
const EXPENSES = {
  expenses: [
    { id: "e1", group_id: "g1", group_name: "Snacks", vendor_id: "v1", vendor_name: "Nestle", amount: 1000, description: "Breakage", added_by: "admin", added_at: "2026-06-01T10:00:00Z", adjusted: false, adjusted_at: null, payable_id: null },
    { id: "e2", group_id: "g1", group_name: "Snacks", vendor_id: "v1", vendor_name: "Nestle", amount: 500, description: "Freight", added_by: "admin", added_at: "2026-06-02T10:00:00Z", adjusted: true, adjusted_at: "2026-06-03T10:00:00Z", payable_id: "p1" },
  ],
};

async function load(page: Page) {
  await stub(page, "GET", /\/api\/groups$/, GROUPS);
  await stub(page, "GET", /\/api\/vendors$/, VENDORS);
  await stub(page, "GET", /\/api\/supplier-expenses.*/, EXPENSES);
}

test.describe("Supplier expenses", () => {
  test.beforeEach(async ({ context, page }) => {
    await authAs(context, "manager");
    await load(page);
    await page.goto("/expenses");
    await expect(page.getByText("Breakage")).toBeVisible();
  });

  test("renders pending/adjusted state (smoke)", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Supplier Expenses" })).toBeVisible();
    // exact: the status badges are exactly "Pending"/"Deducted" (stat cards say "Pending Adjustments" / "Deductions Applied").
    await expect(page.getByText("Pending", { exact: true })).toBeVisible();
    await expect(page.getByText("Deducted", { exact: true })).toBeVisible();
  });

  test("records a new expense", async ({ page }) => {
    await stub(page, "POST", /\/api\/supplier-expenses$/, { message: "ok" });
    await page.locator(".card", { hasText: "Record New Expense" }).locator("select").selectOption({ label: "Snacks" });
    await page.getByPlaceholder("0.00").fill("750");
    await page.locator("textarea").fill("Promo discount");
    const req = page.waitForRequest((r) => r.url().includes("/api/supplier-expenses") && r.method() === "POST");
    await page.getByRole("button", { name: "Record Expense" }).click();
    expect((await req).postDataJSON()).toMatchObject({ group_id: "g1", vendor_id: "v1", amount: 750, description: "Promo discount" });
    await expect(page.getByText("Expense recorded")).toBeVisible();
  });

  test("adjusts a pending expense", async ({ page }) => {
    await stub(page, "POST", /\/api\/supplier-expenses\/e1\/adjust$/, { message: "ok" });
    page.on("dialog", (d) => d.accept());
    await page.locator(".card", { hasText: "Breakage" }).getByRole("button", { name: "Adjust Balance" }).click();
    await expect(page.getByText("Balance adjusted")).toBeVisible();
  });

  test("reverts an adjusted expense", async ({ page }) => {
    await stub(page, "POST", /\/api\/supplier-expenses\/e2\/revert$/, { message: "ok" });
    page.on("dialog", (d) => d.accept());
    await page.locator(".card", { hasText: "Freight" }).getByRole("button", { name: "Revert Adjustment" }).click();
    await expect(page.getByText("Adjustment reverted")).toBeVisible();
  });
});
