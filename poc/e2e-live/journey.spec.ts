// P1-17 · G-9 — the real journey on a temporary Supabase (CI only; never the project database, D-18):
// sign in with two-factor → add a client → enter and submit a journal → a second Firm Admin
// approves it → the trial balance shows it, balanced. Users are seeded by .github/workflows/ci.yml.
import { expect, test, type Page } from "@playwright/test";
import { totp } from "./totp";

const PASSWORD = process.env.E2E_PASSWORD ?? "Ledger-e2e-2026";
const MAKER = "maker@e2e.test";
const CHECKER = "checker@e2e.test";
const CLIENT = `E2E Trading LLC ${Date.now()}`;

/** Signs in and completes two-factor set-up on first use (computing the code from the shown key). */
async function signIn(page: Page, email: string) {
  page.on("console", (m) => { if (m.type() === "warning" || m.type() === "error") console.log(`[browser ${m.type()}] ${m.text()}`); });
  page.on("response", async (r) => { if (r.url().includes("/auth/v1/") && r.status() >= 400) console.log(`[auth ${r.status()}] ${r.url()} ${await r.text().catch(() => "")}`); });
  await page.goto("/");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Two-factor sign-in is required")).toBeVisible();          // SEC-09: nothing before MFA
  await page.getByText("Can't scan? Enter this key instead").click();
  const secret = (await page.locator("details code").innerText()).trim();
  await page.getByLabel("6-digit code").fill(totp(secret));
  await page.getByRole("button", { name: "Turn on two-factor" }).click();
  await expect(page.getByRole("heading", { name: "Clients" })).toBeVisible();
}

async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
}

test("sign in with MFA → add client → journal → second admin approves → trial balance", async ({ page }) => {
  test.setTimeout(120_000);

  // Maker: add a client and submit a journal (Dr Rent 1,000 / Cr Accruals 1,000 — LED-01)
  await signIn(page, MAKER);
  await page.getByRole("button", { name: "Add client" }).first().click();
  const add = page.getByRole("dialog", { name: "Add client" });
  await add.getByLabel("Legal name (as on the trade licence)").fill(CLIENT);
  await add.getByRole("button", { name: "Add client" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  await page.locator("aside").getByRole("button", { name: "Journals" }).click();
  await page.getByRole("button", { name: "New journal" }).click();
  const editor = page.getByRole("dialog", { name: "New journal" });
  await editor.getByLabel("Description", { exact: true }).fill("E2E rent accrual");
  await editor.getByLabel("Line 1 account").selectOption({ label: "6100 · Rent" });
  await editor.getByLabel("Line 1 debit").fill("1,000");
  await editor.getByLabel("Line 2 account").selectOption({ label: "2010 · Accruals" });
  await editor.getByLabel("Line 2 credit").fill("1000.00");
  await expect(editor.getByText("Debits 1,000.00 · Credits 1,000.00")).toBeVisible();
  await editor.getByRole("button", { name: "Submit for approval" }).click();
  await expect(page.getByText("Waiting for approval").first()).toBeVisible();

  // Maker-checker (R1): the maker sees no "Approve" on their own journal
  await page.locator("aside").getByRole("button", { name: "Approvals" }).click();
  await page.getByRole("cell", { name: "E2E rent accrual" }).click();
  await expect(page.getByRole("button", { name: "Approve and post" })).toHaveCount(0);
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).first().click();

  // Maker: a customer and a sales invoice (P2-02 · VAT-01: net 10,000 → VAT 500)
  await page.locator("aside").getByRole("button", { name: "Customers & suppliers" }).click();
  await page.getByRole("button", { name: "Customer", exact: true }).click();
  const cust = page.getByRole("dialog", { name: "New customer" });
  await cust.getByLabel("Name (as on their trade licence or invoice)").fill("E2E Buyer LLC");
  await cust.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("cell", { name: /E2E Buyer LLC/ })).toBeVisible();

  await page.locator("aside").getByRole("button", { name: "Sales invoices" }).click();
  await page.getByRole("button", { name: "New invoice" }).click();
  const inv = page.getByRole("dialog", { name: "New invoice" });
  await inv.getByLabel("Customer").selectOption({ label: "E2E Buyer LLC" });
  await inv.getByLabel("Line 1 description").fill("E2E consulting");
  await inv.getByLabel("Line 1 unit price").fill("10,000");
  await inv.getByLabel("Line 1 account").selectOption({ label: "4010 · Revenue - services" });
  await expect(inv.getByText("Total AED 10,500.00")).toBeVisible();
  await inv.getByRole("button", { name: "Submit for approval" }).click();
  await expect(page.getByRole("cell", { name: "E2E Buyer LLC" })).toBeVisible();
  await signOut(page);

  // Checker: approve and post, then read the trial balance
  await signIn(page, CHECKER);
  await page.getByRole("main").getByText(CLIENT).click();
  await page.locator("aside").getByRole("button", { name: "Approvals" }).click();
  await page.getByRole("cell", { name: "E2E rent accrual" }).click();
  await page.getByRole("button", { name: "Approve and post" }).click();
  await expect(page.getByText(/Posted as JV-\d{4}-\d{2}-0001/)).toBeVisible();

  // Checker approves the invoice: numbered INV-…-0001, journal posted (maker-checker R1)
  await page.locator("aside").getByRole("button", { name: "Sales invoices" }).click();
  await page.getByRole("cell", { name: "E2E Buyer LLC" }).click();
  await page.getByRole("button", { name: "Approve and post" }).click();
  await expect(page.getByText(/Posted as INV-\d{4}-\d{2}-0001/)).toBeVisible();
  await page.getByRole("cell", { name: "E2E Buyer LLC" }).click();
  await page.getByRole("button", { name: "Print / PDF" }).click();
  await expect(page.locator(".print-area")).toContainText("Total payable");
  await expect(page.locator(".print-area")).toContainText("AED 10,500.00");
  await page.locator(".print-area").getByRole("button", { name: "Close" }).click();

  await page.locator("aside").getByRole("button", { name: "Trial balance & ledger" }).click();
  await expect(page.getByText("Balanced")).toBeVisible();
  await expect(page.getByRole("row", { name: /1100\s*Trade receivables/ })).toContainText("10,500.00");
  await expect(page.getByRole("row", { name: /2100\s*VAT output/ })).toContainText("500.00");
  const rent = page.getByRole("row", { name: /6100\s*Rent/ });
  await expect(rent).toContainText("1,000.00");
  const accruals = page.getByRole("row", { name: /2010\s*Accruals/ });
  await expect(accruals).toContainText("1,000.00");

  // Drill-down: account → ledger → journal (Principle 10)
  await rent.click();
  await expect(page.getByText("General ledger — 6100 · Rent")).toBeVisible();
  await page.getByRole("cell", { name: /JV-\d{4}-\d{2}-0001/ }).click();
  await expect(page.getByRole("dialog")).toContainText("E2E rent accrual");
});

test("SEC-08 · there is no way to sign up from the app", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await expect(page.getByText(/sign up|create account|register/i)).toHaveCount(0);
  await expect(page.getByText("Access is by invitation only.")).toBeVisible();
});
