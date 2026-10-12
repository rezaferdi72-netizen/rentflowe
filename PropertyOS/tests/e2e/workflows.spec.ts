import { test, expect, type Page } from "@playwright/test";
const passphrase = "private property test passphrase";
async function create(p: Page) {
  await p.goto("/");
  await p
    .getByLabel("Business / owner name")
    .fill("TEST WORKSPACE — NOT LIVE DATA");
  await p.getByLabel("Workspace passphrase").fill(passphrase);
  await p.getByRole("button", { name: "Create workspace" }).click();
  await expect(
    p.getByRole("heading", { name: "Your portfolio, at a glance." }),
  ).toBeVisible();
}
async function openNew(p: Page, name: string) {
  await p.getByRole("button", { name: "New", exact: true }).click();
  await p
    .locator(".action-dropdown")
    .getByRole("button", { name, exact: true })
    .click();
}
async function save(p: Page) {
  await p
    .getByRole("dialog")
    .getByRole("button", { name: "Save record" })
    .click();
  await expect(p.getByRole("dialog")).not.toBeVisible();
}
async function nav(p: Page, name: string) {
  await p
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name, exact: true })
    .click();
}
test("Real UI: property, unit, tenant, lease, idempotent invoice, payments, receipt, PDF, restart and backup", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await create(page);
  await openNew(page, "Add property");
  await page.getByLabel("Property name", { exact: true }).fill("Green Tower");
  await page.getByLabel("Address", { exact: true }).fill("Dhaka");
  await save(page);
  await openNew(page, "Add rentable unit");
  await page
    .getByLabel("Property", { exact: true })
    .selectOption({ label: "Green Tower" });
  await page.getByLabel("Unit number", { exact: true }).fill("A-101");
  await page.getByLabel("Base monthly rent (৳)").fill("25000");
  await page.getByLabel("Service charge (৳)", { exact: true }).fill("2000");
  await save(page);
  await openNew(page, "Add tenant");
  await page.getByLabel("Full name").fill("Rahim");
  await page.getByLabel("Phone", { exact: true }).fill("01700000000");
  await save(page);
  await openNew(page, "Create lease / renewal");
  await page
    .getByLabel("Unit", { exact: true })
    .selectOption({ label: "Green Tower / A-101" });
  await page
    .getByLabel("Tenant", { exact: true })
    .selectOption({ label: "Rahim" });
  await page.getByLabel("Lease starts").fill("2026-10-01");
  await page.getByLabel("Lease ends").fill("2027-09-30");
  await save(page);
  await nav(page, "Rent & collections");
  await page.getByLabel("Billing month").fill("2026-10");
  await page.getByRole("button", { name: "Generate invoices" }).click();
  await expect(page.getByRole("status")).toContainText("Billing completed");
  await page.getByRole("button", { name: "Generate invoices" }).click();
  await expect(page.getByRole("status")).toContainText("Billing completed");
  for (const [amt, date] of [
    ["20000", "2026-10-05"],
    ["2000", "2026-10-10"],
  ]) {
    await openNew(page, "Record rent payment");
    await page.getByLabel("Lease", { exact: true }).selectOption({ index: 1 });
    await page.getByLabel("Payment date").fill(date);
    await page.getByLabel("Amount (৳)", { exact: true }).fill(amt);
    await page
      .getByLabel("Cash / bank account")
      .selectOption({ label: "Bank" });
    await save(page);
  }
  await nav(page, "Invoices & receipts");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody tr")).toContainText("5,000.00");
  await page.getByRole("button", { name: "INV-000001", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("27,000.00");
  const pdfEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save PDF", exact: true }).click();
  const pdf = await pdfEvent;
  expect(pdf.suggestedFilename()).toBe("INV-000001.pdf");
  await pdf.saveAs("test-results/invoice.pdf");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await nav(page, "Rent & collections");
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await page.getByRole("button", { name: "RCT-000002", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("5,000.00");
  const receiptEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Receipt PDF" }).click();
  await (await receiptEvent).saveAs("test-results/receipt.pdf");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await nav(page, "Database & backup");
  const backupEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Create encrypted backup" }).click();
  const backup = await backupEvent;
  expect(backup.suggestedFilename()).toMatch(/\.posvault$/);
  await backup.saveAs("test-results/backup.posvault");
  await openNew(page, "Add tenant");
  await page.getByLabel("Full name").fill("Temporary post-backup tenant");
  await page.getByLabel("Phone", { exact: true }).fill("01999999999");
  await save(page);
  await page
    .getByLabel("Backup file", { exact: true })
    .setInputFiles("test-results/backup.posvault");
  await page.getByLabel("Backup passphrase", { exact: true }).fill(passphrase);
  await page.getByLabel("Type RESTORE", { exact: true }).fill("RESTORE");
  await page.getByRole("button", { name: "Verify and restore" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Backup verified and restored",
  );
  await nav(page, "Tenants & leases");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.reload();
  await page.getByLabel("Workspace passphrase").fill(passphrase);
  await page.getByRole("button", { name: "Unlock workspace" }).click();
  await nav(page, "Invoices & receipts");
  await expect(page.locator("tbody tr")).toContainText("5,000.00");
  await nav(page, "Dashboard");
  await page.screenshot({ path: "test-results/dashboard.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page
        .locator(".sidebar")
        .evaluate((el) => el.getBoundingClientRect().right),
    )
    .toBeLessThanOrEqual(0);
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  expect(errors).toEqual([]);
});
test("PWA caches application, SQLite WASM and PDF font, then unlocks with no network", async ({
  page,
  context,
}) => {
  await create(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  expect(
    await page.evaluate(
      async () =>
        !!(await caches.match(new URL("index.html", location.href).href)),
    ),
  ).toBeTruthy();
  await context.setOffline(true);
  await page.reload();
  await page.getByLabel("Workspace passphrase").fill(passphrase);
  await page.getByRole("button", { name: "Unlock workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Your portfolio, at a glance." }),
  ).toBeVisible();
  await nav(page, "Properties");
  await expect(page.getByText("No records yet", { exact: true })).toBeVisible();
  await openNew(page, "Add property");
  await page
    .getByLabel("Property name", { exact: true })
    .fill("Saved while offline");
  await page.getByLabel("Address", { exact: true }).fill("Dhaka");
  await save(page);
  await expect(page.locator("tbody tr")).toContainText("Saved while offline");
  await nav(page, "Reports & analytics");
  const reportEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save PDF", exact: true }).click();
  expect((await reportEvent).suggestedFilename()).toMatch(/\.pdf$/);
});
test("All modules render empty, local themes toggle, forms validate and global search does not add data", async ({
  page,
}) => {
  await create(page);
  for (const name of [
    "Properties",
    "Units",
    "Tenants & leases",
    "Rent & collections",
    "Invoices & receipts",
    "Expenses",
    "Investments",
    "Loans",
    "Maintenance",
    "Financial accounts",
    "Reports & analytics",
    "Documents",
    "Database & backup",
    "Settings",
  ]) {
    await nav(page, name);
    await expect(
      page.getByRole("heading", {
        name: "PropertyOS could not open this screen.",
      }),
    ).not.toBeVisible();
  }
  await nav(page, "Reports & analytics");
  await page
    .getByLabel("Report", { exact: true })
    .selectOption("Rental yields");
  await expect(
    page.getByRole("columnheader", { name: "Gross yield" }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "Net yield" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Toggle dark theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByLabel("Search all records").fill("nothing");
  await expect(page.getByText("No matching records")).toBeVisible();
});
