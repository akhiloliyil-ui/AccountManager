import { defineConfig } from "@playwright/test";

const PORT = 3210;
export const STATE = "e2e/.auth/state.json";
export const OWNER = { username: "akhil", password: "e2e-owner-pass-2026" };

/**
 * End-to-end tests against a production build and a throwaway embedded database.
 * Run `npm run build` first; uses the locally installed Google Chrome.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: process.env.PW_CHANNEL ?? "chrome",
    trace: "retain-on-failure",
  },
  projects: [
    // Creates the passcode on the fresh database and saves the signed-in browser state.
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    { name: "app", testMatch: /app\.spec\.ts/, dependencies: ["setup"], use: { storageState: STATE } },
    // Runs last: it changes the passcode and signs devices out.
    { name: "auth", testMatch: /auth\.spec\.ts/, dependencies: ["app"] },
  ],
  webServer: {
    command: `rm -rf .data/e2e && next start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    env: { PGLITE_DIR: ".data/e2e", DATABASE_URL: "", TZ: "Asia/Dubai" },
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
