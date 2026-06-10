import { test, expect } from "@playwright/test";
import { authAs } from "./utils/auth";
import { stub } from "./utils/stub";

/* REVENUE REPORT — port of cypress/e2e/reports.cy.ts (test plan §14). */

const GROUPS = { groups: [{ id: "g1", name: "Snacks" }] };
const REPORT = {
  months: [
    {
      month: "2026-06", month_label: "Jun 2026",
      revenue: 1000, cogs: 600, gross_profit: 400, expenses: 100, net_profit: 300, pieces: 50, cartons: 5,
      parties: [{ name: "Al-Madina", revenue: 1000, cogs: 600, gross_profit: 400, pieces: 50, cartons: 5 }],
    },
  ],
};

test.describe("Revenue report", () => {
  test.beforeEach(async ({ context, page }) => {
    await authAs(context, "manager");
    await stub(page, "GET", /\/api\/groups$/, GROUPS);
    await page.goto("/reports/revenue");
    await expect(page.getByRole("heading", { name: "Revenue Report" })).toBeVisible();
  });

  test("nothing loads until Load Report is clicked (smoke)", async ({ page }) => {
    await expect(page.getByText("Monthly Summary")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Load Report" })).toBeVisible();
  });

  test("loads and displays revenue totals", async ({ page }) => {
    await stub(page, "GET", /\/api\/reports\/revenue.*/, REPORT);
    await page.getByRole("button", { name: "Load Report" }).click();
    await expect(page.getByText("Monthly Summary")).toBeVisible();
    await expect(page.getByText("Jun 2026")).toBeVisible();
    await expect(page.getByText("Grand Total")).toBeVisible();
  });

  test("shows an error when the report fails", async ({ page }) => {
    await stub(page, "GET", /\/api\/reports\/revenue.*/, { message: "Report failed to generate" }, 500);
    await page.getByRole("button", { name: "Load Report" }).click();
    await expect(page.getByText("Report failed to generate")).toBeVisible();
  });
});
