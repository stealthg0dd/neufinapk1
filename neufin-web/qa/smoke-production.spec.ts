import { test, expect } from '@playwright/test'

const BASE = 'https://www.neufin.ai'

test.describe('Production smoke tests', () => {

  test('Homepage loads and is correct domain', async ({ page }) => {
    await page.goto(BASE)
    await expect(page).toHaveURL(/neufin\.ai/)
    await expect(page).toHaveTitle(/NeuFin/)
  })

  test('Login page accessible', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await expect(page.locator('input[type="email"]')).toBeVisible()
  })

  test('Public research page loads', async ({ page }) => {
    await page.goto(`${BASE}/research`)
    await expect(page).not.toHaveURL(/error/)
  })

  test('Pricing page loads', async ({ page }) => {
    await page.goto(`${BASE}/pricing`)
    await expect(page.locator('text=Free')).toBeVisible()
  })

  test('Partners page loads', async ({ page }) => {
    await page.goto(`${BASE}/partners`)
    await expect(page).not.toHaveURL(/error/)
  })

  test('Production API health', async ({ request }) => {
    const res = await request.get(
      'https://neufin101-production.up.railway.app/health'
    )
    expect(res.status()).toBe(200)
  })

})
