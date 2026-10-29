import { expect, test as setup } from "@playwright/test";
import { OWNER, STATE } from "../playwright.config";

setup("first visit creates the owner account", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Set up GPA" })).toBeVisible();

  await page.getByLabel("Username").fill(OWNER.username);
  await page.getByLabel("Your name").fill("Akhil");
  await page.getByLabel(/^Password/).fill("12345678");
  await page.getByLabel("Repeat password").fill("12345678");
  await page.getByRole("button", { name: "Create owner and open GPA" }).click();
  await expect(page.locator("form [role=alert]")).toContainText("harder to guess");

  await page.getByLabel(/^Password/).fill(OWNER.password);
  await page.getByLabel("Repeat password").fill(OWNER.password);
  await page.getByRole("button", { name: "Create owner and open GPA" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.context().storageState({ path: STATE });
});
