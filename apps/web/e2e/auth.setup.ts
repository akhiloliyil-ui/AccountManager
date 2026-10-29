import { expect, test as setup } from "@playwright/test";
import { PASSCODE, STATE } from "../playwright.config";

setup("first visit asks for a household passcode", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Set a passcode for GPA" })).toBeVisible();

  await page.getByLabel("New passcode").fill("123456");
  await page.getByLabel("Repeat passcode").fill("123456");
  await page.getByRole("button", { name: "Set passcode and open GPA" }).click();
  await expect(page.locator("form [role=alert]")).toContainText("less guessable");

  await page.getByLabel("New passcode").fill(PASSCODE);
  await page.getByLabel("Repeat passcode").fill(PASSCODE);
  await page.getByRole("button", { name: "Set passcode and open GPA" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.context().storageState({ path: STATE });
});
