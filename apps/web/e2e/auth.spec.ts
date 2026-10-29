import { expect, test, type Browser, type Page } from "@playwright/test";
import { OWNER, STATE } from "../playwright.config";

/** A browser that has never signed in. */
test.use({ storageState: { cookies: [], origins: [] } });
test.describe.configure({ mode: "serial" });

async function signIn(page: Page, username: string, password: string, landing = /\/$/) {
  await page.goto("/login");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(landing);
}

async function asOwner(browser: Browser) {
  const context = await browser.newContext({ storageState: STATE });
  return { context, page: await context.newPage() };
}

async function addPerson(page: Page, p: { username: string; name: string; password: string; role: "Read" | "Write" | "Admin"; accounts: string[] }) {
  await page.goto("/settings/users");
  await page.getByRole("button", { name: "Add person" }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByLabel(/^Username/).fill(p.username);
  await sheet.getByLabel("Name", { exact: true }).fill(p.name);
  await sheet.getByLabel(/^Password/).fill(p.password);
  await sheet.getByRole("tab", { name: p.role }).click();
  for (const a of p.accounts) await sheet.getByRole("checkbox", { name: new RegExp(a.replace(/[()]/g, "\\$&")) }).check();
  await sheet.getByRole("button", { name: "Add person" }).click();
  await expect(page.getByText(`@${p.username}`)).toBeVisible();
}

test("signed-out visitors see only the sign-in page, and land where they were going", async ({ page }) => {
  await page.goto("/accounts");
  await expect(page).toHaveURL(/\/login\?next=%2Faccounts$/);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();

  const csv = await page.request.get("/api/export/transactions");
  expect(csv.url()).toContain("/login");
  expect(await csv.text()).not.toContain("Lunch at the office");

  await page.getByLabel("Username").fill(OWNER.username);
  await page.getByLabel("Password").fill("not-the-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator("form [role=alert]")).toHaveText("That username and password don't match");

  await page.getByLabel("Password").fill(OWNER.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/accounts$/);
  await expect(page.getByRole("heading", { level: 1, name: "Accounts" })).toBeVisible();
});

test("a forged session cookie is rejected on the server", async ({ page, context }) => {
  await context.addCookies([{ name: "gpa_session", value: `v2.x.1.${Math.floor(Date.now() / 1000)}.forged`, url: "http://localhost:3210" }]);
  await page.goto("/transactions");
  await expect(page).toHaveURL(/\/login/);
  expect(await (await page.request.get("/api/export/transactions")).text()).not.toContain("Lunch at the office");
});

test("Server Actions refuse to run without a session", async ({ page, context }) => {
  await signIn(page, OWNER.username, OWNER.password);
  await page.goto("/accounts");
  await page.getByRole("button", { name: "Add account" }).click();
  await context.clearCookies();
  const sheet = page.getByRole("dialog");
  await sheet.getByLabel("Name").fill("Sneaky account");
  await sheet.getByLabel("Opening balance").fill("1");
  await sheet.getByRole("button", { name: "Add account" }).click();
  await expect(page.getByText("You've been signed out")).toBeVisible();
});

test("a Write member sees and changes only their accounts, and can't reach admin settings", async ({ browser, page }) => {
  const owner = await asOwner(browser);
  await addPerson(owner.page, { username: "priya", name: "Priya", password: "priya-pass-2026", role: "Write", accounts: ["ESAF (NRI)"] });
  await owner.context.close();

  await signIn(page, "priya", "priya-pass-2026");
  await page.goto("/accounts");
  await expect(page.getByRole("link", { name: /ESAF \(NRI\)/ })).toBeVisible();
  await expect(page.getByText("Salary Account")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add account" })).toHaveCount(0);

  const csv = await (await page.request.get("/api/export/transactions")).text();
  expect(csv).not.toContain("SALARY OCT 2026");
  expect(csv).not.toContain("Lunch at the office");

  await page.goto("/settings");
  await expect(page.getByText("People & access")).toHaveCount(0);
  await page.goto("/settings/users");
  await expect(page).toHaveURL(/\/settings$/);
  await page.goto("/settings/currencies");
  await expect(page).toHaveURL(/\/settings$/);

  // Her own account: she can add an expense to it, and everyone sees who added it.
  await page.goto("/transactions/new");
  await expect(page.getByLabel("Account")).toContainText("ESAF (NRI)");
  await expect(page.getByLabel("Account")).not.toContainText("Salary Account");
  await page.getByLabel("Amount in INR").fill("250");
  await page.getByPlaceholder("e.g. Monthly purchase").fill("Chai with friends");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("link", { name: /Chai with friends/ })).toBeVisible();

  const owner2 = await asOwner(browser);
  await owner2.page.goto("/transactions");
  await expect(owner2.page.getByRole("link", { name: /Chai with friends/ })).toContainText("by Priya");
  await owner2.page.getByRole("link", { name: /Chai with friends/ }).click();
  await expect(owner2.page.getByText(/Added by Priya on/)).toBeVisible();
  await owner2.context.close();
});

test("a Read member can look but not change anything", async ({ browser, page }) => {
  const owner = await asOwner(browser);
  await addPerson(owner.page, { username: "dad", name: "Dad", password: "dad-pass-2026", role: "Read", accounts: ["Salary Account"] });
  await owner.context.close();

  await signIn(page, "dad", "dad-pass-2026");
  await page.goto("/transactions");
  await expect(page.getByText("SALARY OCT 2026").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Import", exact: true })).toHaveCount(0);
  await page.goto("/transactions/new");
  await expect(page).toHaveURL(/\/transactions$/);

  await page.getByRole("link", { name: /SALARY OCT 2026/ }).first().click();
  await expect(page.getByText("You have read-only access")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeHidden();

  // Grocery lists are shared, but read-only for him.
  await page.goto("/lists/current");
  await expect(page.getByText("View only: your access is read-only.")).toBeVisible();
  await expect(page.getByRole("checkbox").first()).toBeDisabled();
});

test("people are limited to five, and changing a password signs other devices out", async ({ browser, page }) => {
  const owner = await asOwner(browser);
  await addPerson(owner.page, { username: "sam", name: "Sam", password: "sam-pass-2026", role: "Admin", accounts: [] });
  await addPerson(owner.page, { username: "nia", name: "Nia", password: "nia-pass-2026", role: "Read", accounts: ["Cash"] });
  await expect(owner.page.getByText("5 of 5 people")).toBeVisible();
  await expect(owner.page.getByRole("button", { name: "Add person" })).toBeDisabled();
  await owner.context.close();

  const phone = await browser.newContext();
  const phonePage = await phone.newPage();
  await signIn(phonePage, "priya", "priya-pass-2026");

  await signIn(page, "priya", "priya-pass-2026");
  await page.goto("/settings/security");
  await page.getByLabel("Current password").fill("priya-pass-2026");
  await page.getByLabel("New password", { exact: true }).fill("priya-new-pass-26");
  await page.getByLabel("Repeat new password").fill("priya-new-pass-26");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText("Password changed")).toBeVisible();

  await page.goto("/stats");
  await expect(page.getByRole("heading", { name: "Stats" })).toBeVisible();
  await phonePage.goto("/stats");
  await expect(phonePage).toHaveURL(/\/login/);
  await phone.close();
});
