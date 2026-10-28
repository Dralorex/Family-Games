import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const base = 'http://localhost:5173/Family-Games'
const outDir = '/tmp/fg-demo'
fs.mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  recordVideo: { dir: outDir, size: { width: 390, height: 844 } },
})
const page = await context.newPage()

await page.goto(`${base}/`)
await page.waitForTimeout(800)
await page.screenshot({ path: '/opt/cursor/artifacts/home_games_scorecards.png' })

await page.getByRole('link', { name: 'Games' }).click()
await page.waitForTimeout(400)
await page.screenshot({ path: '/opt/cursor/artifacts/games_hub_hot_potato.png' })

await page.getByRole('link', { name: 'Home' }).click()
await page.getByRole('link', { name: 'Scorecards' }).click()
await page.waitForTimeout(400)
await page.screenshot({ path: '/opt/cursor/artifacts/scorecards_five_templates.png' })

await page.getByRole('link', { name: /Play 9/ }).click()
await page.getByPlaceholder('Enter a name').fill('Alex')
await page.getByRole('button', { name: 'Continue' }).click()
await page.getByRole('button', { name: 'Create scorecard' }).click()
await page.getByRole('button', { name: 'Start scorecard' }).click()
await page.getByLabel('Your score this round').fill('7')
await page.getByRole('button', { name: 'Submit score' }).click()
await page.waitForTimeout(400)
await page.locator('.tab-bar').getByRole('button', { name: 'Score', exact: true }).click()
await page.waitForTimeout(400)
await page.screenshot({ path: '/opt/cursor/artifacts/play9_score_tab_shows_7.png' })

await page.getByRole('link', { name: 'Home' }).click().catch(() => page.goto(`${base}/`))
await page.goto(`${base}/games/hot-potato/create`)
await page.getByPlaceholder('Enter a name').fill('Alex')
await page.getByRole('button', { name: 'Continue' }).click()
await page.getByRole('button', { name: '15–45s' }).click()
await page.getByRole('button', { name: 'Create room' }).click()
await page.waitForTimeout(800)
await page.screenshot({ path: '/opt/cursor/artifacts/hot_potato_lobby.png' })

await context.close()
await browser.close()

const videos = fs.readdirSync(outDir).filter((f) => f.endsWith('.webm'))
if (videos[0]) {
  const dest = '/opt/cursor/artifacts/family_games_home_scorecard_hot_potato_demo.webm'
  fs.copyFileSync(path.join(outDir, videos[0]), dest)
  console.log('Wrote', dest)
}
console.log('Screenshots saved to /opt/cursor/artifacts')
