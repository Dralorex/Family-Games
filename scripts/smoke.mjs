import { chromium } from 'playwright'

const base = 'http://localhost:5173/Family-Games'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()

await page.goto(`${base}/`)
await page.getByRole('link', { name: 'Scorecards' }).click()
await page.getByRole('link', { name: /Play 9/ }).click()
await page.getByPlaceholder('Enter a name').fill('Alex')
await page.getByRole('button', { name: 'Continue' }).click()
await page.getByLabel('Game title').fill('Friday Play 9')
await page.getByRole('button', { name: 'Create scorecard' }).click()
await page.getByRole('button', { name: 'Start scorecard' }).click()
await page.getByLabel(/score/i).fill('7')
await page.getByRole('button', { name: 'Submit score' }).click()
await page.waitForTimeout(400)

const hero = await page.locator('.hero-number').innerText()
console.log('HERO after R1 submit:', hero)

await page.locator('.tab-bar').getByRole('button', { name: 'Score', exact: true }).click()
await page.waitForTimeout(300)
const cells = await page.locator('.score-table td').allTextContents()
console.log('CELLS:', cells)
const headers = await page.locator('.score-table thead th').allTextContents()
console.log('HEADERS:', headers)

if (!headers.includes('Alex')) {
  console.error('FAIL: names should be across the top')
  process.exit(1)
}
if (!cells.includes('7')) {
  console.error('FAIL: expected round score 7')
  process.exit(1)
}
if (hero !== '7') {
  console.error('FAIL: hero should show total after round 1, got', hero)
  process.exit(1)
}
console.log('PASS: transposed scorecard + hero after R1')
await page.screenshot({ path: '/opt/cursor/artifacts/scorecard_ux_transposed.png', fullPage: true })
await browser.close()
