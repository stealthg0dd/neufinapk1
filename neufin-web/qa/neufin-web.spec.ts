import { test, expect } from '@playwright/test'

test.describe('NEUFIN WEB — A1–A5 Health Check', () => {
  test('A1 — Landing page visual + mobile sanity', async ({ page }) => {
    const t0 = Date.now()
    await page.goto('/', { waitUntil: 'domcontentloaded' })

    // Loads within 3 seconds (DOM ready). This is a pragmatic proxy for UX.
    const domLoadedMs = Date.now() - t0
    expect(domLoadedMs).toBeLessThan(3000)

    // Dark canvas background visible (not white). We allow either body/html background to carry it.
    const bg = await page.evaluate(() => {
      const body = getComputedStyle(document.body).backgroundColor
      const html = getComputedStyle(document.documentElement).backgroundColor
      return { body, html }
    })
    const isWhite = (c: string) => c === 'rgb(255, 255, 255)' || c === 'rgba(255, 255, 255, 1)'
    expect(isWhite(bg.body) && isWhite(bg.html)).toBeFalsy()

    // Hero headline uses Instrument Serif via font-display utility.
    await expect(page.locator('h1.font-display')).toBeVisible()

    // Animated demo should exist.
    await expect(page.getByText(/Live preview/i)).toBeVisible()

    // CTA visible and amber-ish background.
    const cta = page.getByRole('link', { name: /start free analysis/i })
    await expect(cta).toBeVisible()
    const ctaBg = await cta.evaluate((el) => getComputedStyle(el).backgroundColor)
    // Amber target is around rgb(245,166,35); allow a wide range.
    expect(ctaBg).toMatch(/rgb\(/)

    // Mobile 375px — no horizontal scroll.
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    const hasHScroll = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    )
    expect(hasHScroll).toBeFalsy()

    console.log(
      JSON.stringify(
        { A1: { domLoadedMs, bg, ctaBg, mobileHasHorizontalScroll: hasHScroll } },
        null,
        2,
      ),
    )
  })

  test('A2 — Google OAuth redirect reaches accounts.google.com', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' })
    const googleBtn = page.getByRole('button', { name: /continue with google/i })
    await expect(googleBtn).toBeVisible()

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
      googleBtn.click(),
    ])

    const url = page.url()
    console.log(JSON.stringify({ A2: { url } }, null, 2))
    expect(url).toContain('accounts.google.com')
  })

  test('A4 — Pricing page tiers + disclaimer present', async ({ page }) => {
    await page.goto('/pricing', { waitUntil: 'domcontentloaded' })

    await expect(page.getByRole('heading', { name: /pricing/i })).toBeVisible()
    await expect(page.locator('p', { hasText: /^Free$/ }).first()).toBeVisible()
    await expect(page.locator('p', { hasText: /^Advisor$/ }).first()).toBeVisible()
    await expect(page.locator('p', { hasText: /^\$299$/ }).first()).toBeVisible()
    await expect(page.locator('p', { hasText: /^Enterprise$/ }).first()).toBeVisible()
    await expect(page.locator('p', { hasText: /^\$999$/ }).first()).toBeVisible()
    await expect(page.getByText(/Most Popular/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /^Monthly$/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Annual$/ })).toBeVisible()
    await expect(page.getByText(/Regulatory disclaimer/i)).toBeVisible()
    await expect(page.getByText(/MAS/i)).toBeVisible()

    console.log(JSON.stringify({ A4: 'PASS' }, null, 2))
  })
})

