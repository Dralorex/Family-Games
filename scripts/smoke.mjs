import { chromium } from 'playwright'

const base = 'http://localhost:5173/Family-Games'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
page.on('console', (msg) => {
  if (msg.type() === 'error') console.log('console error:', msg.text())
})

await page.goto(`${base}/`)
await page.getByRole('link', { name: 'Scorecards' }).click()
await page.getByRole('link', { name: /Play 9/ }).click()
await page.getByPlaceholder('Enter a name').fill('Alex')
await page.getByRole('button', { name: 'Continue' }).click()
await page.getByRole('button', { name: 'Create scorecard' }).click()
await page.getByRole('button', { name: 'Start scorecard' }).click()
await page.getByLabel('Your score this round').fill('7')
await page.getByRole('button', { name: 'Submit score' }).click()
await page.waitForTimeout(500)
const updateVisible = await page.getByRole('button', { name: 'Update score' }).isVisible()
console.log('Update score button visible:', updateVisible)

await page.locator('.tab-bar').getByRole('button', { name: 'Score', exact: true }).click()
await page.waitForTimeout(300)

const body = await page.locator('.score-table').innerText()
console.log('SCORE TABLE:\n' + body)

await page.locator('.tab-bar').getByRole('button', { name: 'Main', exact: true }).click()
await page.waitForTimeout(200)
const hero = await page.locator('.hero-number').innerText()
console.log('HERO:', hero)

const cells = await page.locator('.tab-bar').getByRole('button', { name: 'Score', exact: true }).click().then(async () => {
  await page.waitForTimeout(200)
  return page.locator('.score-table td').allTextContents()
})
console.log('CELLS:', cells)
if (!cells.includes('7')) {
  console.error('FAIL: expected round score 7 in table')
  await page.screenshot({ path: '/tmp/smoke-fail.png', fullPage: true })
  process.exit(1)
}
console.log('PASS: score 7 persisted')
await page.screenshot({ path: '/tmp/smoke-score-ok.png', fullPage: true })
await browser.close()
