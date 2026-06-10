# E2E Test Plan — Distribution POS

Living catalog of **every use case** in the app and the **test cases** that cover it.
Each spec under `cypress/e2e/` implements one section here.

## How to read this doc

Each use case is written as a scenario:

> **Given** a starting state · **When** the user acts · **Then** the expected outcome.

Test-type tags per case:

| Tag | Meaning |
|-----|---------|
| 🟢 happy | the normal, everything-works path |
| 🔴 sad | expected failure (bad input, rejected request) |
| 🟡 edge | boundary / unusual input |
| 🔐 authz | role / permission enforcement (manager vs cashier) |
| 💨 smoke | page renders + core controls exist |
| 🔁 regression | pins existing behavior so future changes are intentional |

## Roles

- **manager** — full access: finance, purchases, vendors, stock, exports, reversals.
- **cashier** — sales + view inventory + groups/suppliers (read). No finance/stock/export.

Route protection lives in `middleware.ts`: no valid `token` cookie → pages redirect to `/login`, API → 401.

## Test data / running

- Stubbed specs need only `npm run dev` (network faked, no DB).
- Real-backend specs need seeded users. Provide creds via `cypress.env.json` (gitignored):
  ```json
  { "MANAGER_USER": "...", "MANAGER_PASS": "...", "CASHIER_USER": "...", "CASHIER_PASS": "...",
    "LOGIN_USER": "...", "LOGIN_PASS": "..." }
  ```
- Programmatic auth: `cy.loginAsManager()` / `cy.loginAsCashier()` (see `cypress/support/commands.ts`).

---

## 1. Auth & Session  → `Login.cy.ts`, `auth.cy.ts`

Routes: `/login`, `/api/login`, `/api/logout`, `/api/me`, `middleware.ts`

| # | Use case | Type |
|---|----------|------|
| 1.1 | Login form renders (username, password masked, Sign In) | 💨 |
| 1.2 | Empty submit blocked by HTML `required`, no request sent | 🔴 |
| 1.3 | Wrong creds → 401 → error banner, stays on /login | 🔴 |
| 1.4 | Valid creds → success toast + auth cookie set + redirect off /login | 🟢 |
| 1.5 | Username sent as typed; server lowercases + strips spaces | 🟡🔁 |
| 1.6 | Submitting shows spinner + disables button (no double submit) | 🟢 |
| 1.7 | Visiting protected route while logged out → redirect to /login | 🔐 |
| 1.8 | Visiting /login while already logged in → redirect to / | 🔐🔁 |
| 1.9 | Protected `/api/*` without token → 401 JSON | 🔐 |
| 1.10 | Logout clears cookie → next protected visit redirects to /login | 🟢 |
| 1.11 | Tampered/expired token → treated as logged out (redirect) | 🔴 |
| 1.12 | `/api/me` returns role for valid token, `{role:null}` otherwise | 🟢 |

## 2. Navigation & Role-based UI  → `navbar.cy.ts`

Component: `app/components/navbar.tsx`

| # | Use case | Type |
|---|----------|------|
| 2.1 | Manager sees Finance + Vendors + Export dropdowns | 🔐 |
| 2.2 | Cashier does NOT see Finance/Export; sees Groups+Suppliers links | 🔐 |
| 2.3 | Navbar hidden on /login | 💨 |
| 2.4 | Each nav link routes to correct path | 🟢 |
| 2.5 | Active link highlighted by current path | 🔁 |
| 2.6 | Mobile menu toggle opens/closes | 🟢 |
| 2.7 | Logout button calls /api/logout and routes to /login | 🟢 |

## 3. POS Terminal  → `pos.cy.ts`

Routes: `/`, `/api/items`, `/api/orders`, `/api/reverse`
Components: `InventoryGrid`, `CartSideBar`, `CartModal`, `CartItemRow`, `CartButton`

| # | Use case | Type |
|---|----------|------|
| 3.1 | Item grid loads from /api/items (deduped by name) | 💨🟢 |
| 3.2 | Search/filter items by name | 🟢 |
| 3.3 | Click item → added to cart; qty increments on repeat | 🟢 |
| 3.4 | Change qty / remove line in cart; total recalculates | 🟢🟡 |
| 3.5 | Apply discount (amount + description) → total updates | 🟢 |
| 3.6 | Checkout with payment method → order created, seq_no assigned | 🟢 |
| 3.7 | Empty cart cannot checkout | 🔴 |
| 3.8 | Qty exceeding stock handled (block or warn) | 🟡 |
| 3.9 | Order assigned to table_no when provided | 🟡 |
| 3.10 | seq_no resets per 08:00 daily cycle | 🔁 |

## 4. Sale Invoices  → `sale-invoices.cy.ts`

Routes: `/sales/new`, `/sales`, `/sales/[id]/print`, `/sales/[id]/print-urdu`
APIs: `/api/sale-invoices`, `/api/sale-invoices/[id]`, `/api/sale-invoices/[id]/reverse`

| # | Use case | Type |
|---|----------|------|
| 4.1 | New sale invoice page renders (customer, items, totals) | 💨 |
| 4.2 | Add line items, qty × price → line + grand total compute | 🟢🟡 |
| 4.3 | Select customer (credit) vs walk-in (cash) | 🟢 |
| 4.4 | Save invoice → appears in /sales list | 🟢 |
| 4.5 | Cannot save invoice with no items / no customer where required | 🔴 |
| 4.6 | Sales list filters by date range | 🟢 |
| 4.7 | Open invoice detail / print view renders totals correctly | 🟢 |
| 4.8 | Urdu print view renders RTL layout | 💨 |
| 4.9 | Reverse invoice → mirror with negative qty, stock restored | 🟢🔁 |
| 4.10 | Reverse is manager-only | 🔐 |
| 4.11 | Double-reverse prevented | 🔴 |

## 5. Customers  → `customers.cy.ts`

Routes: `/customers`, `/customers/[id]`
APIs: `/api/customers`, `/api/customers/[id]`, `/api/customers/[id]/aging`, `/api/customers/aging-detail`

| # | Use case | Type |
|---|----------|------|
| 5.1 | Customer list renders | 💨 |
| 5.2 | Create customer (name, phone, opening balance) | 🟢 |
| 5.3 | Create validation: required fields, duplicate name/phone | 🔴 |
| 5.4 | Edit customer details | 🟢 |
| 5.5 | Delete customer (block if balance/transactions exist) | 🟡🔴 |
| 5.6 | Customer detail shows ledger + running balance | 🟢 |
| 5.7 | Aging report buckets (0-30/31-60/61-90/90+) compute | 🔁 |
| 5.8 | Search/filter customers | 🟢 |

## 6. Vendors / Suppliers  → `vendors.cy.ts`

Routes: `/vendors`, `/vendors/[id]`
APIs: `/api/vendors`, `/api/vendors/[id]`

| # | Use case | Type |
|---|----------|------|
| 6.1 | Vendor list renders (manager + cashier both reach it) | 💨🔐 |
| 6.2 | Create vendor | 🟢 |
| 6.3 | Create validation: required, duplicate | 🔴 |
| 6.4 | Edit vendor | 🟢 |
| 6.5 | Delete vendor (block if linked purchases/balance) | 🟡🔴 |
| 6.6 | Vendor detail shows payable balance + ledger | 🟢 |
| 6.7 | Create/edit/delete is manager-only (cashier read-only) | 🔐 |

## 7. Products / Inventory  → `inventory.cy.ts`

Routes: `/inventory/view`, `/inventory/add`
APIs: `/api/inventory`, `/api/inventory/[id]`, `/api/inventory/update-name`, `/api/inventory/[id]/price-adjust`, `/api/items`, `/api/godams/item-stock`
Components: `AddItemModal`, `UpdateItemModal`, `UpdateUnitModal`, `UpdatePricesModal`, `UpdateNameModal`, `ItemCard`

| # | Use case | Type |
|---|----------|------|
| 7.1 | Inventory view renders, read-only for cashier | 💨🔐 |
| 7.2 | Add product (name, units, sale/cost price) | 🟢 |
| 7.3 | Add validation: required, negative/zero price/qty | 🔴🟡 |
| 7.4 | Update stock units (add/subtract) | 🟢 |
| 7.5 | Update sale/cost prices | 🟢 |
| 7.6 | Rename product via update-name | 🟢🔁 |
| 7.7 | Price adjustment recorded with reason | 🟢 |
| 7.8 | Add/update product is manager-only | 🔐 |
| 7.9 | Item stock per godam shown correctly | 🟢 |

## 8. Warehouse / Godams  → `warehouse.cy.ts`

Routes: `/warehouse`
APIs: `/api/godams`, `/api/godams/[id]`, `/api/godams/[id]/stock`, `/api/godams/item-stock`

| # | Use case | Type |
|---|----------|------|
| 8.1 | Warehouse page renders list of godams | 💨 |
| 8.2 | Create godam | 🟢 |
| 8.3 | Edit / delete godam (block delete if stock present) | 🟢🔴 |
| 8.4 | View stock per godam | 🟢 |
| 8.5 | Stock transfer / adjustment between godams | 🟢🟡 |
| 8.6 | Manager-only access | 🔐 |

## 9. Purchases  → `purchases.cy.ts`

Routes: `/purchases`, `/purchases/new`, `/purchases/[id]/edit`, `/purchases/[id]/print`
APIs: `/api/purchase-invoices`, `/api/purchase-invoices/[id]`, `/api/cash-purchases`

| # | Use case | Type |
|---|----------|------|
| 9.1 | Purchases list renders | 💨🔐 |
| 9.2 | New purchase: select vendor, add items, qty×cost → totals | 🟢🟡 |
| 9.3 | Save purchase → stock increases, vendor payable increases | 🟢🔁 |
| 9.4 | Cash purchase vs credit purchase | 🟢 |
| 9.5 | Validation: no vendor / no items | 🔴 |
| 9.6 | Edit existing purchase → stock + balances re-sync | 🟢🔁 |
| 9.7 | Print purchase invoice renders | 💨 |
| 9.8 | Purchases are manager-only | 🔐 |

## 10. Groups  → `groups.cy.ts`

Routes: `/groups`, `/groups/[id]`
APIs: `/api/groups`, `/api/groups/[id]`, `/api/account/[groupId]`

| # | Use case | Type |
|---|----------|------|
| 10.1 | Groups list renders (manager + cashier) | 💨🔐 |
| 10.2 | Create / edit / delete group | 🟢🔴 |
| 10.3 | Group detail shows accounts/members | 🟢 |
| 10.4 | Account view per group computes balances | 🔁 |

## 11. Payments  → `payments.cy.ts`

Routes: `/payments`
APIs: `/api/payments/customer`, `/api/payments/vendor`

| # | Use case | Type |
|---|----------|------|
| 11.1 | Payments page renders | 💨🔐 |
| 11.2 | Record customer receipt → customer balance decreases | 🟢🔁 |
| 11.3 | Record vendor payment → vendor payable decreases | 🟢🔁 |
| 11.4 | Validation: amount > 0, party selected | 🔴 |
| 11.5 | Overpayment handling (credit / block) | 🟡 |
| 11.6 | Manager-only | 🔐 |

## 12. Expenses  → `expenses.cy.ts`

Routes: `/expenses`, `/finance`
APIs: `/api/expenses`, `/api/company-expenses`, `/api/company-expenses/[id]/apply`, `/api/supplier-expenses`, `/api/supplier-expenses/[id]`, `/api/supplier-expenses/[id]/adjust`, `/api/supplier-expenses/[id]/revert`, `/api/labour-expenses`, `/api/investments`

| # | Use case | Type |
|---|----------|------|
| 12.1 | Expenses page renders | 💨🔐 |
| 12.2 | Log company expense (amount, description) | 🟢 |
| 12.3 | Apply company expense (allocation) | 🟢🔁 |
| 12.4 | Log supplier expense | 🟢 |
| 12.5 | Adjust supplier expense → balance reflects | 🟢🔁 |
| 12.6 | Revert supplier expense → undoes adjustment | 🟢🔁 |
| 12.7 | Log labour expense | 🟢 |
| 12.8 | Record investment (finance) | 🟢 |
| 12.9 | Validation: amount > 0, description required | 🔴 |
| 12.10 | Manager-only | 🔐 |

## 13. Price Adjustments & Discounts  → `pricing.cy.ts`

APIs: `/api/price-adjustments`, `/api/price-adjustments/[id]`, `/api/price-adjustments/[id]/apply`, `/api/discounts/apply`, `/api/discounts/check`, `/api/verify-price-override`

| # | Use case | Type |
|---|----------|------|
| 13.1 | Create price adjustment | 🟢 |
| 13.2 | Apply price adjustment → prices change | 🟢🔁 |
| 13.3 | Discount check validates code/limit | 🟢🔴 |
| 13.4 | Apply discount within allowed range | 🟢 |
| 13.5 | Price override requires manager verification | 🔐 |
| 13.6 | Invalid override rejected | 🔴 |

## 14. Reports & Exports  → `reports.cy.ts`

Routes: `/reports/revenue`
APIs: `/api/reports/revenue`, `/api/export?type=...`, `/api/export/ledger`, `/api/ledger-entries`

| # | Use case | Type |
|---|----------|------|
| 14.1 | Revenue report page renders with date filter | 💨🟢 |
| 14.2 | Revenue totals compute for selected range | 🔁 |
| 14.3 | Export Products → .xlsx download | 🟢 |
| 14.4 | Export Old Sales (orders) → .xlsx | 🟢 |
| 14.5 | Export Revenue ledger → .xlsx | 🟢 |
| 14.6 | Export is manager-only (cashier 401/forbidden) | 🔐 |
| 14.7 | Export failure shows alert | 🔴 |

---

## Cross-cutting concerns (apply to every domain)

- **AuthZ matrix**: each manager-only route → cashier gets redirected / forbidden.
- **Empty states**: list pages render gracefully with zero rows.
- **Loading states**: spinners/disabled buttons during in-flight requests.
- **Server error (500)**: UI shows an error, doesn't crash (stub `forceNetworkError`/500).
- **Currency/number formatting**: totals format consistently.
- **Timezone**: date logic uses `NEXT_PUBLIC_TIMEZONE` (Asia/Karachi); cycle boundary 08:00.

## Implementation order (by business risk)

1. Auth/session + navbar (gates everything) ✅ Login done
2. Customers, Vendors (master data, simple CRUD — good learning specs)
3. Inventory/Products
4. Sale Invoices + POS (revenue path)
5. Purchases (stock-in path)
6. Payments, Expenses, Groups, Warehouse
7. Pricing, Reports, Exports
