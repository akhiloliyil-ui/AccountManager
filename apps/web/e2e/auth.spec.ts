import { expect, test, type Page } from "@playwright/test";
import { PASSCODE, STATE } from "../playwright.config";

/** A browser that has never signed in. */
test.use({ storageState: { cookies: [], origins: [] } });

async function signIn(page: Page, passcode = PASSCODE) {
  await page.goto("/login");
  await page.getByLabel("Passcode").fill(passcode);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/);
}

test("signed-out visitors see only the sign-in page, and land where they were going", async ({ page }) => {
  await page.goto("/accounts");
  await expect(page).toHaveURL(/\/login\?next=%2Faccounts$/);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();

  // Data endpoints redirect too, rather than returning anything.
  const csv = await page.request.get("/api/export/transactions");
  expect(csv.url()).toContain("/login");
  expect(await csv.text()).not.toContain("Lunch at the office");

  await page.getByLabel("Passcode").fill("not-the-passcode");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator("form [role=alert]")).toHaveText("That passcode isn't right");

  await page.getByLabel("Passcode").fill(PASSCODE);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/accounts$/);
  await expect(page.getByRole("heading", { level: 1, name: "Accounts" })).toBeVisible();
});

test("a forged session cookie is rejected on the server", async ({ page, context }) => {
  await context.addCookies([{ name: "gpa_session", value: `v1.${Math.floor(Date.now() / 1000)}.forged`, url: "http://localhost:3210" }]);
  await page.goto("/transactions");
  await expect(page).toHaveURL(/\/login/);
  const csv = await page.request.get("/api/export/transactions");
  expect(await csv.text()).not.toContain("Lunch at the office");
});

test("Server Actions refuse to run without a session", async ({ page, context }) => {
  await signIn(page);
  await page.goto("/accounts");
  await page.getByRole("button", { name: "Add account" }).click();
  await context.clearCookies();
  const sheet = page.getByRole("dialog");
  await sheet.getByLabel("Name").fill("Sneaky account");
  await sheet.getByLabel("Opening balance").fill("1");
  await sheet.getByRole("button", { name: "Add account" }).click();
  await expect(page.getByText("You've been signed out")).toBeVisible();
});

test("changing the passcode signs other devices out", async ({ page, browser }) => {
  const other = await browser.newContext({ storageState: STATE });
  const otherPage = await other.newPage();
  await otherPage.goto("/stats");
  await expect(otherPage.getByRole("heading", { name: "Stats" })).toBeVisible();

  await signIn(page);
  await page.goto("/settings/security");
  await page.getByLabel("Current passcode").fill(PASSCODE);
  await page.getByLabel("New passcode", { exact: true }).fill("a-brand-new-passcode");
  await page.getByLabel("Repeat new passcode").fill("a-brand-new-passcode");
  await page.getByRole("button", { name: "Change passcode" }).click();
  await expect(page.getByText("Passcode changed")).toBeVisible();

  // This device stays signed in; the other one is sent to sign in.
  await page.goto("/stats");
  await expect(page.getByRole("heading", { name: "Stats" })).toBeVisible();
  await otherPage.goto("/stats");
  await expect(otherPage).toHaveURL(/\/login/);
  await other.close();

  await page.goto("/settings");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Passcode").fill(PASSCODE);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator("form [role=alert]")).toBeVisible();
});
