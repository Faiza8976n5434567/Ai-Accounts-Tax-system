import { expect, test, type Page } from "@playwright/test";

const openClient = async (page: Page, name = "Al Noor General Trading LLC") => {
  await page.goto("/");
  await page.getByRole("main").getByText(name).first().click();
  await expect(page.getByRole("main").getByRole("heading", { name })).toBeVisible();
};
// Nav buttons may carry a count badge (e.g. "Purchase bills 2"), so match the start of the name.
const nav = (page: Page, label: string) => page.locator("aside").getByRole("button", { name: new RegExp(`^${label}`) }).first().click();

test("firm overview lists the three demo clients", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Firm overview").first()).toBeVisible();
  for (const c of ["Al Noor General Trading LLC", "Bright Path Consultancy LLC", "Gulf Fresh Restaurants LLC"]) await expect(page.getByRole("main").getByText(c).first()).toBeVisible();
});

test("no AI features remain (D-01)", async ({ page }) => {
  await openClient(page);
  await expect(page.getByText(/Ask your books|AI CFO|AI-coded|AI extraction/)).toHaveCount(0);
  await expect(page.locator("aside").getByText("Purchase bills")).toBeVisible();
});

test("VAT 201 lists every box; demo has zero-rated, exempt and reverse-charge figures (D-12)", async ({ page }) => {
  await openClient(page);
  await nav(page, "VAT 201");
  const row = (label: string) => page.locator("tr", { hasText: label }).first();
  for (const label of ["Standard rated supplies — Ajman", "Zero rated supplies", "Exempt supplies", "Supplies subject to reverse charge", "Standard rated expenses"]) await expect(row(label)).toBeVisible();
  await expect(row("Standard rated supplies — Fujairah")).toContainText("0.00");
  for (const label of ["Zero rated supplies", "Exempt supplies"]) await expect(row(label)).not.toContainText(/\t0\.00\t0\.00/);
});

test("purchase bill: enter by hand → checks → submit → maker-checker blocks self-approval", async ({ page }) => {
  await openClient(page);
  await nav(page, "Purchase bills");
  await page.getByRole("button", { name: "Enter a bill without a file" }).click();
  const field = (label: string) => page.getByLabel(label, { exact: true });
  await field("Supplier").fill("Aldar Properties PJSC");
  await field("Supplier TRN").fill("100067549300003");
  await field("Invoice no.").fill("E2E-0001");
  await field("Description").fill("Office rent — test");
  await field("Taxable value").fill("1000.00");
  await field("VAT").fill("50.00");
  await field("Total").fill("1050.00");
  await field("Total").blur();
  await expect(page.getByText("Valid tax invoice")).toBeVisible();
  await page.getByRole("button", { name: "Submit for approval" }).click();
  await expect(page.getByRole("button", { name: "Approve & post" })).toBeDisabled();
  await expect(page.getByText(/Maker-checker: you prepared this/)).toBeVisible();
});
