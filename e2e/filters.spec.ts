import { expect, test } from '@playwright/test'
import axe from 'axe-core'

const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'phone', width: 390, height: 844 },
  { name: 'small phone', width: 320, height: 568 },
]

for (const viewport of viewports) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`filters overlay stays compact and accessible on ${viewport.name} in ${colorScheme}`, async ({ page }, testInfo) => {
      await page.setViewportSize(viewport)
      await page.emulateMedia({ colorScheme })
      await page.goto('/')
      await expect(page.locator('.live-board__summary')).toContainText(/\d+ posts?/)
      const trigger = page.getByRole('button', { name: 'Filter and sort', exact: true })
      const content = page.locator('.board-list, .board-empty')
      const before = await content.boundingBox()
      expect(before).not.toBeNull()

      await trigger.click()
      const panel = page.getByRole('dialog', { name: 'Filter and sort', exact: true })
      await expect(panel).toBeVisible()
      expect(await panel.evaluate(element => element.matches(':modal'))).toBe(true)
      await expect(trigger).toHaveAttribute('aria-expanded', 'true')
      await expect(panel.getByRole('button', { name: 'All posts' })).toBeFocused()
      const after = await content.boundingBox()
      expect(after?.y).toBe(before?.y)
      expect(after?.height).toBe(before?.height)

      const bounds = await panel.boundingBox()
      expect(bounds?.width).toBeLessThanOrEqual(320)
      expect(bounds?.x).toBeGreaterThanOrEqual(15)
      expect((bounds?.x || 0) + (bounds?.width || 0)).toBeLessThanOrEqual(viewport.width - 15)
      expect((bounds?.y || 0) + (bounds?.height || 0)).toBeLessThanOrEqual(viewport.height - 15)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width)

      await page.evaluate(axe.source)
      const violations = await page.evaluate(async () => {
        const result = await (window as typeof window & { axe: typeof axe }).axe.run(document, {
          runOnly: {
            type: 'tag',
            values: ['wcag2a', 'wcag2aa', 'wcag21aa'],
          },
        })
        return result.violations.map(violation => ({
          id: violation.id,
          targets: violation.nodes.map(node => node.target),
        }))
      })
      expect(violations).toEqual([])
      await page.screenshot({
        path: testInfo.outputPath('filters-open.png'),
      })
      await panel.screenshot({
        path: testInfo.outputPath('filters-panel.png'),
      })

      for (let step = 0; step < 9; step++) {
        await page.keyboard.press('Tab')
        expect(await panel.evaluate(element => element.contains(document.activeElement))).toBe(true)
      }
      await panel.getByRole('button', { name: 'Close filters' }).focus()
      await page.keyboard.press('Shift+Tab')
      await expect(panel.getByRole('button', { name: 'Use my location' })).toBeFocused()
      await page.keyboard.press('Escape')
      await expect(panel).not.toBeVisible()
      await expect(trigger).toBeFocused()
      await expect(trigger).toHaveAttribute('aria-expanded', 'false')

      await trigger.click()
      await panel.getByRole('button', { name: 'Close filters' }).click()
      await expect(panel).not.toBeVisible()
      await expect(trigger).toBeFocused()

      await trigger.click()
      await page.mouse.click(4, 4)
      await expect(panel).not.toBeVisible()
      await expect(trigger).toBeFocused()

      await trigger.click()
      await page.setViewportSize({ width: 360, height: 240 })
      await expect.poll(async () => {
        const resized = await panel.boundingBox()
        return Math.round((resized?.y || 0) + (resized?.height || 0))
      }).toBeLessThanOrEqual(224)
      await page.keyboard.press('Escape')
    })
  }
}

test('filter and sort selections preserve search and reset pagination', async ({ page }) => {
  await page.goto('/?q=overlay-check&page=2')
  const trigger = page.getByRole('button', { name: 'Filter and sort', exact: true })
  await trigger.click()
  const panel = page.getByRole('dialog', { name: 'Filter and sort', exact: true })
  await panel.getByRole('button', { name: 'Service projects' }).click()
  await expect(page).toHaveURL(/filter=service-request/)
  await expect(page).not.toHaveURL(/[?&]page=/)
  await expect(page).toHaveURL(/q=overlay-check/)
  await panel.getByRole('combobox', { name: 'Sort', exact: true }).selectOption('newest')
  await expect(page).toHaveURL(/sort=newest/)
  await expect(panel.getByRole('button', { name: 'Service projects' })).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Escape')
  await page.reload()
  await trigger.click()
  await expect(panel.getByRole('combobox', { name: 'Sort', exact: true })).toHaveValue('newest')
  await expect(panel.getByRole('button', { name: 'Service projects' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page).toHaveURL(/q=overlay-check/)
})

test('location feedback keeps the overlay within a short phone screen', async ({ context, page }) => {
  await context.grantPermissions([])
  await page.setViewportSize({ width: 390, height: 568 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Filter and sort', exact: true }).click()
  const panel = page.getByRole('dialog', { name: 'Filter and sort', exact: true })
  await panel.getByRole('combobox', { name: 'Sort', exact: true }).selectOption('nearby')
  await expect(panel.getByRole('alert')).toBeVisible()
  await expect.poll(async () => {
    const bounds = await panel.boundingBox()
    return Math.round((bounds?.y || 0) + (bounds?.height || 0))
  }).toBeLessThanOrEqual(552)
  await expect(panel.getByRole('combobox', { name: 'Sort', exact: true })).toHaveValue('recent-activity')
})
