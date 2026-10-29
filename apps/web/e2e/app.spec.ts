import { expect, test, type Page } from "@playwright/test";
import { makePdf } from "../../../packages/db/src/make-pdf";

/**
 * One fresh database for the whole file; the tests build on each other in order,
 * like a person setting the app up and using it for the first time.
 */
test.describe.configure({ mode: "serial" });

async function addAccount(page: Page, name: string, group: string, currency: string, opening: string) {
  await page.goto("/accounts");
  await page.getByRole("button", { name: "Add account" }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByLabel("Group").selectOption({ label: group });
  await sheet.getByLabel("Name").fill(name);
  await sheet.getByLabel("Currency").selectOption(currency);
  await sheet.getByLabel("Opening balance").fill(opening);
  await sheet.getByRole("button", { name: "Add account" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
}

test("starts with Money Manager style accounts and categories", async ({ page }) => {
  await page.goto("/settings/account-groups");
  for (const group of ["Cash", "Card", "Debit Card", "Investments", "Loan", "Friends"]) {
    await expect(page.getByText(group, { exact: true }).first()).toBeVisible();
  }
  await page.goto("/settings/currencies");
  await expect(page.getByText("Base currency")).toBeVisible();
  await expect(page.getByLabel("INR per AED")).toHaveValue("24.1");
});

test("adds accounts in AED and INR", async ({ page }) => {
  await addAccount(page, "Salary Account", "Accounts", "AED", "5000");
  await addAccount(page, "ESAF (NRI)", "Savings", "INR", "0");
  await page.goto("/accounts");
  await expect(page.getByText("DH 5,000.00").first()).toBeVisible();
});

test("records an expense with a calculated amount and a subcategory", async ({ page }) => {
  await page.goto("/transactions/new");
  await page.getByLabel("Amount in AED").fill("12+8.5");
  await page.getByRole("button", { name: "Choose a category" }).click();
  const picker = page.getByRole("dialog");
  await picker.getByRole("button", { name: /Food/ }).click();
  await picker.getByRole("button", { name: "Eating out" }).click();
  await page.getByPlaceholder("e.g. Monthly purchase").fill("Lunch at the office");
  await page.getByRole("button", { name: "Save", exact: true }).click();

  await expect(page).toHaveURL(/\/transactions\?m=/);
  const row = page.getByRole("link", { name: /Lunch at the office/ });
  await expect(row).toContainText("DH 20.50");
  await expect(row).toContainText("Eating out");
});

test("transfers AED to an INR account with a fee", async ({ page }) => {
  await page.goto("/transactions/new?type=transfer");
  const [from, to] = [page.getByLabel("Account").nth(0), page.getByLabel("Account").nth(1)];
  await from.selectOption({ label: "Salary Account (AED)" });
  await to.selectOption({ label: "ESAF (NRI) (INR)" });
  await page.getByLabel("Amount in AED").fill("1000");
  await expect(page.getByLabel("Amount received in INR")).toHaveAttribute("placeholder", "24100");
  await page.getByLabel("Transfer fee").fill("15");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/transactions\?m=/);

  await page.goto("/accounts");
  await expect(page.getByRole("link", { name: /ESAF \(NRI\)/ })).toContainText("₹ 24,100.00");
  await expect(page.getByRole("link", { name: /Salary Account/ })).toContainText("DH 3,985.00");
});

test("splits a purchase into installments", async ({ page }) => {
  await page.goto("/transactions/new");
  await page.getByLabel("Amount in AED").fill("263");
  await page.getByPlaceholder("e.g. Monthly purchase").fill("Kitchen accessories");
  await page.getByRole("button", { name: "Repeat or split into installments" }).click();
  await page.getByLabel("Number of payments").fill("4");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Added 4 transactions")).toBeVisible();
  await expect(page.getByRole("link", { name: /Kitchen accessories.*1\/4/ })).toContainText("DH 65.75");
});

test("basket to expense: ticked grocery items become one expense and count against the budget", async ({ page }) => {
  await page.goto("/lists/current");
  await expect(page).toHaveURL(/\/lists\/.+\?add=1/);
  await page.getByRole("checkbox", { name: /Fresh full-cream milk/ }).click();
  await page.getByRole("checkbox", { name: /White eggs/ }).click();
  await page.getByRole("button", { name: "Confirm purchase" }).click();

  const sheet = page.getByRole("dialog");
  // Scanning needs the AI service, so the test only checks it's offered; entry by hand still works.
  await expect(sheet.getByRole("button", { name: "Scan receipt" })).toBeVisible();
  await sheet.getByLabel("Store").selectOption("lulu");
  await sheet.getByLabel("Amount paid (AED)").fill("38.00");
  await sheet.getByRole("button", { name: "Book expense" }).click();
  await expect(page.getByText("Purchase booked as an expense")).toBeVisible();
  await expect(page.getByRole("link", { name: /Lulu ·/ })).toContainText("DH 38.00");

  await page.goto("/budget");
  await expect(page.getByText("Spent (from your ledger)").locator("..")).toContainText("DH 38.00");

  await page.goto("/transactions");
  await expect(page.getByRole("link", { name: /Groceries at Lulu/ })).toContainText("basket");
});

const statement = `Txn Date,Narration,Withdrawal,Deposit,Balance
01/10/2026,SALARY OCT 2026,,"10,500.00","14,485.00"
02/10/2026,POS 4321XXXXXXXX9876 CARREFOUR MOE DUBAI,27.34,,"14,457.66"
05/10/2026,DEWA BILL PAYMENT,412.10,,"14,045.56"
`;

test("imports a CSV statement once, flags the re-import as duplicates", async ({ page }) => {
  const upload = async (name: string, body: string) => {
    await page.goto("/import");
    await page.getByLabel("Account", { exact: true }).selectOption({ label: "Salary Account (AED)" });
    await page.locator('input[type="file"]').setInputFiles({ name, mimeType: "text/csv", buffer: Buffer.from(body) });
  };

  // First time: match columns, then import.
  await upload("statement.csv", statement);
  await expect(page.getByText("3 transactions read")).toBeVisible();
  await page.getByRole("button", { name: "Check for duplicates and categories" }).click();
  await expect(page.getByText("3 to import")).toBeVisible();
  await expect(page.getByLabel("Category").nth(1)).toHaveValue("e-shopping--grocery");
  await page.getByRole("button", { name: "Import 3 transactions" }).click();
  await expect(page.getByText("3 transactions imported")).toBeVisible();

  // The same file again: the layout is recognised, columns are skipped, and every line is a duplicate.
  await upload("statement.csv", statement);
  await expect(page.getByText(/Recognised Salary Account statement/)).toBeVisible();
  await expect(page.getByText("3 already imported")).toBeVisible();
  await expect(page.getByRole("button", { name: "Import 0 transactions" })).toBeDisabled();

  // Next month's file, with an extra line above the header, goes straight to review too.
  await upload("november.csv", `Statement period,November 2026\n${statement.split("\n")[0]}\n03/11/2026,ETISALAT BILL,299.00,,"13,746.56"\n`);
  await expect(page.getByText(/Recognised Salary Account statement/)).toBeVisible();
  await expect(page.getByText("1 to import")).toBeVisible();

  await page.goto("/import");
  await expect(page.getByText("Saved formats")).toBeVisible();
  await expect(page.getByText("Used 1 time")).toBeVisible();
});

test("promotion PDF: upload, review and publish offers into price comparison", async ({ page }) => {
  const pdf = makePdf(["LULU WEEKLY SAVER", "Al Rawabi Fresh Milk 2L AED 8.95 10.50", "India Gate Basmati Rice 5kg AED 34.50 39.95"]);
  await page.goto("/offers/import");
  await page.locator('input[type="file"]').setInputFiles({ name: "lulu-weekly.pdf", mimeType: "application/pdf", buffer: Buffer.from(pdf) });
  await page.getByRole("button", { name: "Upload and review" }).click();

  await expect(page.getByRole("heading", { name: "Review offers" })).toBeVisible();
  // Next keeps the previous page mounted but hidden; role locators only see the visible one.
  await expect(page.getByRole("combobox", { name: "Store" })).toHaveValue("lulu");
  await expect(page.getByText("Al Rawabi Fresh Milk 2L", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Publish 2 offers" }).click();

  await expect(page).toHaveURL(/\/offers$/);
  await page.getByRole("button", { name: "Lulu" }).click();
  await expect(page.getByText("Now AED 8.95").filter({ visible: true })).toHaveCount(1);
  await expect(page.getByText("lulu-weekly.pdf").first()).toBeVisible();
});

test("stats break spending down by category", async ({ page }) => {
  await page.goto("/stats");
  await expect(page.getByRole("link", { name: /Utility bills/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Shopping/ })).toBeVisible();
  await page.getByRole("link", { name: /Shopping/ }).click();
  // Basket expense (38.00) + the imported Carrefour line (27.34).
  await expect(page.getByRole("main").getByRole("link", { name: /Grocery/ })).toContainText("DH 65.34");
});

test("new subcategories show up in the transaction picker", async ({ page }) => {
  await page.goto("/settings/categories");
  await page.getByRole("button", { name: /Food/ }).first().click();
  await page.getByRole("button", { name: "Add subcategory" }).click();
  await page.getByRole("dialog").getByLabel("Name").fill("Shawarma");
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();

  await page.goto("/transactions/new");
  await page.getByRole("button", { name: "Choose a category" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Food/ }).click();
  await expect(page.getByRole("dialog").getByRole("button", { name: "Shawarma" })).toBeVisible();
});

test("exports transactions as CSV", async ({ page }) => {
  const res = await page.request.get("/api/export/transactions");
  expect(res.headers()["content-type"]).toContain("text/csv");
  const body = await res.text();
  expect(body).toContain("Lunch at the office");
  expect(body).toContain("SALARY OCT 2026");
});

test("online exchange rates are off until switched on", async ({ page }) => {
  // The rate service itself is covered by the database tests with a fake network; the browser test makes no outside calls.
  await page.goto("/settings/currencies");
  await expect(page.getByRole("switch", { name: "Update rates online automatically" })).toHaveAttribute("aria-checked", "false");
  await expect(page.getByText("Never updated online")).toBeVisible();
});

test("installs as an app and shows an offline page without a network", async ({ page, context }) => {
  await page.goto("/settings");
  await expect(page.getByText("Install GPA on this device")).toBeVisible();

  const manifest = await (await page.request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({ display: "standalone", start_url: "/" });
  expect(manifest.icons.map((i: { purpose: string }) => i.purpose)).toContain("maskable");
  for (const icon of manifest.icons) expect((await page.request.get(icon.src)).ok()).toBe(true);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", /apple-touch-icon\.png/);

  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  expect(scope).toMatch(/\/$/);

  await context.setOffline(true);
  await page.goto("/stats").catch(() => {});
  await expect(page.getByRole("heading", { name: "You're offline" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  // Coming back online reloads the page by itself.
  await context.setOffline(false);
  await expect(page.getByRole("heading", { name: "Stats" })).toBeVisible();
});

test("monthly budgets per category show spent, left and over", async ({ page }, testInfo) => {
  await page.goto("/stats");
  await page.getByRole("link", { name: "Budgets" }).click();
  await expect(page.getByText("No budgets yet")).toBeVisible();

  const add = async (category: string, amount: string) => {
    await page.getByRole("button", { name: /Add (a )?budget/ }).first().click();
    const sheet = page.getByRole("dialog");
    await sheet.getByRole("combobox", { name: "Category" }).selectOption(category);
    await sheet.getByLabel(/Monthly limit/).fill(amount);
    await sheet.getByRole("button", { name: "Save budget" }).click();
    await expect(page.getByText("Budget saved")).toBeVisible();
  };
  // "Lunch at the office" (DH 20.50, Food › Eating out) was booked earlier this month.
  await add("e-food", "100");
  await add("e-food--eating-out", "10");

  const eatingOut = page.getByRole("button", { name: "Edit budget for Eating out" });
  await expect(eatingOut).toContainText("Over budget");
  await expect(eatingOut).toContainText("Over by DH 10.50");
  const food = page.getByRole("button", { name: "Edit budget for Food" });
  await expect(food).toContainText("DH 20.50");
  await expect(food).toContainText("DH 79.50 left");
  await page.screenshot({ path: testInfo.outputPath("budgets.png"), fullPage: true });

  await page.goto("/");
  await expect(page.getByText("Budgets · 1 over")).toBeVisible();
  await page.getByText("Budgets · 1 over").scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("home-budgets.png") });
});

test("bills list upcoming installments to confirm or skip", async ({ page }) => {
  // "Kitchen accessories" was split into 4 monthly installments from today: payment 1 is paid, 2–4 are bills.
  const shown = (text: string) => page.getByText(text, { exact: true }).filter({ visible: true });
  await page.goto("/transactions");
  await page.getByRole("link", { name: /^Bills/ }).click();
  await expect(page).toHaveURL(/\/transactions\/bills$/);
  await expect(shown("(1/4)")).toHaveCount(0);
  for (const n of [2, 3, 4]) await expect(shown(`(${n}/4)`)).toBeVisible();

  await page.getByRole("button", { name: /^Mark Kitchen accessories .* as paid$/ }).first().click();
  await expect(shown("Marked as paid")).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Skip" }).last().click();
  await expect(shown("Payment skipped")).toBeVisible();

  await page.reload();
  await expect(shown("(3/4)")).toBeVisible();
  await expect(shown("(2/4)")).toHaveCount(0);
  await expect(shown("(4/4)")).toHaveCount(0);
});

test("the daily job only runs with its secret; My account offers bill reminders", async ({ page, playwright }) => {
  const anon = await playwright.request.newContext({ baseURL: "http://localhost:3210" });
  expect((await anon.get("/api/cron/daily")).status()).toBe(401);
  expect((await anon.get("/api/cron/daily", { headers: { authorization: "Bearer wrong" } })).status()).toBe(401);
  const ok = await anon.get("/api/cron/daily", { headers: { authorization: "Bearer e2e-cron-secret" } });
  expect(ok.status()).toBe(200);
  expect(await ok.json()).toMatchObject({ reminders: "push not configured" });
  await anon.dispose();

  await page.goto("/settings/security");
  await expect(page.getByText("Bill reminders")).toBeVisible();
  await expect(page.getByText("Notifications aren't set up on this server.")).toBeVisible();
});
