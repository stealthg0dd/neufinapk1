/**
 * Lightweight smoke checks for public routes: layout renders and main landmark exists.
 * Run: `cd neufin-web && npx playwright test qa/ui-contrast-smoke.spec.ts`
 * Override base URL: `PLAYWRIGHT_TEST_BASE_URL=http://localhost:3000 npx playwright test ...`
 */
import { test, expect } from "@playwright/test";

const PUBLIC_PATHS = [
  "/",
  "/pricing",
  "/features",
  "/research",
  "/upload",
  "/login",
  "/partners",
  "/blog",
] as const;

for (const path of PUBLIC_PATHS) {
  test(`page renders: ${path}`, async ({ page }) => {
    const res = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(res?.ok(), `${path} HTTP status`).toBeTruthy();
    const main = page.locator("main").first();
    await expect(main).toBeVisible({ timeout: 20_000 });
    const text = await main.innerText();
    expect(text.length, `${path} main has text`).toBeGreaterThan(20);
  });
}
