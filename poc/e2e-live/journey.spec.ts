// P1-17 · G-9 — the real journey on a temporary Supabase (CI only; never the project database, D-18):
// sign in with two-factor → add a client → enter and submit a journal, a sales invoice and a purchase
// bill → a second Firm Admin approves them → the trial balance shows it, balanced. Users are seeded by .github/workflows/ci.yml.
import { expect, test, type Page } from "@playwright/test";
import { totp } from "./totp";

const PASSWORD = process.env.E2E_PASSWORD ?? "Ledger-e2e-2026";
const MAKER = "maker@e2e.test";
const CHECKER = "checker@e2e.test";
const CLIENT = `E2E Trading LLC ${Date.now()}`;

/** Last day of the current calendar quarter (the test client's first VAT period), as YYYY-MM-DD. */
function quarterEnd(): string {
  const d = new Date();
  const end = new Date(Date.UTC(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / 3) * 3 + 3, 0));
  return end.toISOString().slice(0, 10);
}

/** The VAT period selector's label for the current quarter, e.g. "1 Oct 2026 – 31 Dec 2026". */
function currentQuarterLabel(): string {
  const d = new Date();
  const start = new Date(Date.UTC(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / 3) * 3, 1));
  const f = (x: Date) => x.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Dubai" });
  return `${f(start)} – ${f(new Date(quarterEnd() + "T00:00:00Z"))}`;
}

/** A weekday in the current year (so the bill's weekend warning never fires), as YYYY-MM-DD. */
function weekday(): string {
  const d = new Date();
  const shift = d.getDay() === 6 ? -1 : d.getDay() === 0 ? -2 : 0;
  d.setDate(d.getDate() + shift);
  if (d.getFullYear() !== new Date().getFullYear()) d.setDate(d.getDate() + 3);
  return d.toISOString().slice(0, 10);
}

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
  await add.getByLabel("Registered for VAT").check();
  await add.getByLabel("VAT TRN (15 digits)").fill("100111222333003");
  await add.getByLabel("First VAT period ends on (from the registration certificate)").fill(quarterEnd());
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
  await expect(page.getByRole("cell", { name: /E2E Buyer LLC/ }).first()).toBeVisible();

  // P2-07 · contacts import: one new contact imported, the existing one skipped and listed
  await page.getByRole("button", { name: "Import from Excel" }).click();
  const imp = page.getByRole("dialog", { name: "Import customers & suppliers" });
  await imp.getByLabel("Contacts file").setInputFiles({ name: "contacts.csv", mimeType: "text/csv",
    buffer: Buffer.from("Type,Name,TRN,Country\nCustomer,E2E Buyer LLC,,AE\nSupplier,E2E Imported Supplier,,US\n") });
  await imp.getByRole("button", { name: "Import 2" }).click();
  await expect(imp.getByText("contact(s) imported")).toContainText("1");
  await expect(imp.getByText("Row 2: E2E Buyer LLC — already exists (same name)")).toBeVisible();
  await imp.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("cell", { name: /E2E Imported Supplier/ }).first()).toBeVisible();

  await page.locator("aside").getByRole("button", { name: "Sales invoices" }).click();
  await page.getByRole("button", { name: "New invoice" }).click();
  const inv = page.getByRole("dialog", { name: "New invoice" });
  await inv.getByLabel("Customer", { exact: true }).selectOption({ label: "E2E Buyer LLC" });
  await inv.getByLabel("Line 1 description").fill("E2E consulting");
  await inv.getByLabel("Line 1 unit price").fill("10,000");
  await inv.getByLabel("Line 1 account").selectOption({ label: "4010 · Revenue - services" });
  await expect(inv.getByText("Total AED 10,500.00")).toBeVisible();
  await inv.getByRole("button", { name: "Submit for approval" }).click();
  await expect(page.getByRole("cell", { name: "E2E Buyer LLC" })).toBeVisible();

  // Maker: a supplier and a purchase bill (P2-03 · VAT-06: 25,000 + 1,250, valid TRN and heading → recoverable)
  await page.locator("aside").getByRole("button", { name: "Customers & suppliers" }).click();
  await page.getByRole("button", { name: "Supplier", exact: true }).click();
  const sup = page.getByRole("dialog", { name: "New supplier" });
  await sup.getByLabel("Name (as on their trade licence or invoice)").fill("E2E Supplier LLC");
  await sup.getByLabel("TRN (15 digits, if VAT registered)").fill("100300400500003");
  await sup.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("cell", { name: /E2E Supplier LLC/ }).first()).toBeVisible();

  await page.locator("aside").getByRole("button", { name: "Purchase bills" }).click();
  await page.getByRole("button", { name: "New bill" }).click();
  const bill = page.getByRole("dialog", { name: "New bill" });
  await bill.getByLabel("Supplier", { exact: true }).selectOption({ label: "E2E Supplier LLC · TRN 100300400500003" });
  await bill.getByLabel("Supplier's invoice number").fill("ES-1001");
  await bill.getByLabel("Bill date").fill(weekday());
  await bill.getByLabel("Line 1 description").fill("E2E audit support");
  await bill.getByLabel("Line 1 unit price").fill("25,000");
  await bill.getByLabel("Line 1 account").selectOption({ label: "6130 · Professional fees" });
  await expect(bill.getByText("Payable AED 26,250.00")).toBeVisible();
  await bill.getByLabel(/Full tax invoice: shows our name, address and TRN/).check();             // D-46: over AED 10,000
  await bill.getByRole("button", { name: "Submit for approval" }).click();
  const saved = page.getByRole("dialog", { name: /Bill ES-1001/ });
  await expect(saved.getByText("Compliance checks — 1 to review")).toBeVisible();              // only the round-sum warning
  await expect(saved.getByText("Low · 10")).toBeVisible();
  await saved.getByRole("button", { name: "Close" }).first().click();
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

  // Checker approves the bill: input VAT recovered (box 9)
  await page.locator("aside").getByRole("button", { name: "Purchase bills" }).click();
  await page.getByRole("cell", { name: "E2E Supplier LLC" }).click();
  await page.getByRole("button", { name: "Approve and post" }).click();
  await expect(page.getByText(/Posted as JV-\d{4}-\d{2}-0003/)).toBeVisible();

  // P2-04 · ARAP-05: the customer pays 11,000 for the 10,500 invoice → 500 Customer Credit. Prepared by the
  // checker, so the checker sees no "Approve and post" on it (maker-checker R1).
  await page.locator("aside").getByRole("button", { name: "Receipts & payments" }).click();
  await page.getByRole("main").getByRole("button", { name: "Receipt", exact: true }).click();
  const rc = page.getByRole("dialog", { name: "New customer receipt" });
  await rc.getByLabel("Contact").selectOption({ label: "E2E Buyer LLC" });
  await rc.getByLabel("Amount", { exact: true }).fill("11,000");
  await expect(rc.getByText("Settles AED 10,500.00 · customer credit 500.00")).toBeVisible();
  await rc.getByRole("button", { name: "Submit for approval" }).click();
  const receipt = page.getByRole("dialog", { name: /Customer receipt \(draft\) · E2E Buyer LLC/ });
  await expect(receipt.getByText("Waiting for approval")).toBeVisible();
  await expect(receipt.getByRole("button", { name: "Approve and post" })).toHaveCount(0);
  await receipt.getByRole("button", { name: "Close" }).first().click();

  // P2-05 · bank: set up 1010, upload the bank's own CSV (columns guessed, D-38), the same file twice is refused
  // (BANK-01), and a bank charge is posted to 6400 for a second person's approval (D-39).
  await page.locator("aside").getByRole("button", { name: "Bank", exact: true }).click();
  await page.getByRole("button", { name: "Set up bank account" }).click();
  const setup = page.getByRole("dialog", { name: "Set up bank account" });
  await setup.getByLabel("Name").fill("Current account");
  await setup.getByLabel("Bank", { exact: true }).fill("Emirates NBD");
  await setup.getByRole("button", { name: "Save" }).click();
  const csv = { name: "enbd-oct.csv", mimeType: "text/csv", buffer: Buffer.from(
    'Value Date,Narration,Debit,Credit,Balance\n07/10/2026,BANK CHARGE,52.50,,-52.50\n08/10/2026,TRANSFER E2E BUYER,,"11,000.00","10,947.50"\n') };
  for (const attempt of [1, 2]) {
    await page.getByRole("button", { name: "Upload statement" }).click();
    const up = page.getByRole("dialog", { name: "Upload bank statement" });
    await up.getByLabel("Statement file").setInputFiles(csv);
    await expect(up.getByText("2 line(s) ready")).toBeVisible();
    await up.getByRole("button", { name: "Import" }).click();
    if (attempt === 1) await expect(page.getByText("2 new line(s) imported")).toBeVisible();
    else {
      await expect(up.getByRole("alert")).toContainText("already uploaded");
      await up.getByRole("button", { name: "Cancel" }).click();
    }
  }
  await page.getByRole("row", { name: /BANK CHARGE/ }).getByRole("button", { name: "Other…" }).click();
  const other = page.getByRole("dialog");
  await other.getByLabel("Account").selectOption({ label: "6400 · Bank charges" });
  await other.getByRole("button", { name: "Send for approval" }).click();
  await expect(page.getByText("Sent for approval — it is matched once a second person approves it")).toBeVisible();

  await page.locator("aside").getByRole("button", { name: "Reports" }).click();
  await expect(page.getByText("Balanced")).toBeVisible();
  await expect(page.getByRole("row", { name: /1100\s*Trade receivables/ })).toContainText("10,500.00");
  await expect(page.getByRole("row", { name: /2100\s*VAT output/ })).toContainText("500.00");
  await expect(page.getByRole("row", { name: /1300\s*VAT input/ })).toContainText("1,250.00");
  await expect(page.getByRole("row", { name: /2000\s*Trade payables/ })).toContainText("26,250.00");
  const rent = page.getByRole("row", { name: /6100\s*Rent/ });
  await expect(rent).toContainText("1,000.00");
  const accruals = page.getByRole("row", { name: /2010\s*Accruals/ });
  await expect(accruals).toContainText("1,000.00");

  // Drill-down: account → ledger → journal (Principle 10)
  await rent.click();
  await expect(page.getByText("General ledger — 6100 · Rent")).toBeVisible();
  await page.getByRole("cell", { name: /JV-\d{4}-\d{2}-0001/ }).click();
  await expect(page.getByRole("dialog")).toContainText("E2E rent accrual");

  // P2-06 · balance sheet balances (RPT-01) and the P&L shows the year's result; figures drill to the ledger (RPT-04)
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).first().click();
  await page.getByRole("button", { name: "Trial balance", exact: true }).last().click();          // back from the ledger
  await page.getByRole("button", { name: "Balance sheet", exact: true }).click();
  await expect(page.getByText("Total liabilities and equity")).toBeVisible();
  await expect(page.getByText("Balanced", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Profit & loss", exact: true }).click();
  await expect(page.getByText("Net profit / (loss) for the period")).toBeVisible();
  await page.getByRole("row", { name: /4010\s*Revenue - services/ }).click();
  await expect(page.getByText("General ledger — 4010 · Revenue - services")).toBeVisible();

  // P3-01/02 · VAT 201: the 10,000 invoice is in box 1a (head office Abu Dhabi); the checker submits the return
  await page.locator("aside").getByRole("button", { name: "VAT return" }).click();
  await page.getByLabel("VAT period").selectOption({ label: currentQuarterLabel() });
  await expect(page.getByRole("row", { name: /^1a\s/ })).toContainText("10,000.00");
  await expect(page.getByRole("row", { name: /^1a\s/ })).toContainText("500.00");
  await expect(page.getByRole("row", { name: /^1c\s/ })).toContainText("0.00");
  await expect(page.getByText("Reconciliation with the ledger (VAT-14)")).toBeVisible();          // P3-03
  await expect(page.getByText("Every difference is explained.")).toBeVisible();
  await page.getByRole("button", { name: "Submit for approval" }).click();
  await expect(page.getByText("Waiting for approval").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve and freeze" })).toHaveCount(0);

  // P3-06 · client logins: a Firm Admin can invite a Client Owner, Staff or Read-only user (end date pre-filled, D-49)
  await page.locator("aside").getByRole("button", { name: "Client users" }).click();
  await expect(page.getByText("No client logins yet.")).toBeVisible();
  await page.getByRole("button", { name: "Invite", exact: true }).click();
  const invDlg = page.getByRole("dialog", { name: /Invite to/ });
  await expect(invDlg.getByLabel("Role").locator("option")).toHaveText(["Client Owner", "Client Staff", "Read-only"]);
  await invDlg.getByLabel("Role").selectOption({ label: "Read-only" });
  await expect(invDlg.getByLabel("Access ends on")).not.toHaveValue("");
  await invDlg.getByRole("button", { name: "Cancel" }).click();

  // P2-08 · integrity checks run on demand: no problems (bank housekeeping warnings are possible)
  await page.locator("aside").getByRole("button", { name: "Integrity" }).click();
  const icRow = page.getByRole("row", { name: new RegExp(CLIENT) });
  await icRow.getByRole("button", { name: "Run now" }).click();
  await expect(page.getByText("Checks finished")).toBeVisible();
  await expect(icRow).toContainText(/All checks passed|warning/);
  await expect(icRow).not.toContainText("problem");
  await expect(page.getByText("Trial balance: total debits = total credits")).toBeVisible();

  // P3-05 · deadlines: the client's current VAT quarter appears on the calendar (due 28 days after the quarter)
  await page.locator("aside").getByRole("button", { name: "Deadlines" }).click();
  await page.getByLabel("Period").selectOption({ label: "Next 12 months" });
  await expect(page.getByRole("row", { name: new RegExp(`${CLIENT}.*VAT return and payment`) }).first()).toBeVisible();

  // P3-07 · firm dashboard: the client is listed with its figures; it has approvals waiting (the receipt and bank journal)
  await page.locator("aside").getByRole("button", { name: "Dashboard" }).click();
  await expect(page.getByText("Waiting for approval").first()).toBeVisible();
  const dashRow = page.getByRole("row", { name: new RegExp(CLIENT) });
  await expect(dashRow).toContainText("waiting for approval");
  await expect(dashRow).toContainText("10,000.00");                                                 // revenue this year
});

test("SEC-08 · there is no way to sign up from the app", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await expect(page.getByText(/sign up|create account|register/i)).toHaveCount(0);
  await expect(page.getByText("Access is by invitation only.")).toBeVisible();
});
