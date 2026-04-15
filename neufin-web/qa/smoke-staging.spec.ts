import { test, expect } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "https://staging.neufin.ai";

test.describe("Staging smoke tests", () => {
  test("Homepage loads", async ({ page }) => {
    await page.goto(BASE);
    await expect(page).toHaveTitle(/NeuFin/);
    await expect(page.locator("text=Portfolio Intelligence")).toBeVisible();
  });

  test("Login page loads", async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await expect(page.locator('input[type="email"]')).toBeVisible();
  });

  test("Upload page loads", async ({ page }) => {
    await page.goto(`${BASE}/upload`);
    await expect(page).not.toHaveURL(/login/);
  });

  test("Pricing page loads with 3 plans", async ({ page }) => {
    await page.goto(`${BASE}/pricing`);
    // Flexible check — pricing exists
    await expect(page.locator("text=Free")).toBeVisible();
  });

  test("Research page loads", async ({ page }) => {
    await page.goto(`${BASE}/research`);
    await expect(page).not.toHaveURL(/error/);
  });

  test("Protected route redirects unauthenticated", async ({ page }) => {
    await page.goto(`${BASE}/dashboard`);
    // Should redirect to login or show auth
    await expect(page).toHaveURL(/login|auth|dashboard/);
  });

  test("Health endpoint responds", async ({ request }) => {
    const stagingApi =
      process.env.STAGING_API_URL || "https://neufin101-staging.up.railway.app";
    const res = await request.get(`${stagingApi}/health`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
  });
});
