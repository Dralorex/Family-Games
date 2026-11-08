import { chromium } from 'playwright'

const BASE = 'http://127.0.0.1:4173/Family-Games'

async function main() {
  const browser = await chromium.launch({ headless: true })

  const hostCtx = await browser.newContext()
  const host = await hostCtx.newPage()
  await host.goto(`${BASE}/`)
  const closeUpdates = host.getByRole('button', { name: 'Close updates' })
  if (await closeUpdates.count()) {
    await closeUpdates.click({ timeout: 3000 }).catch(() => {})
  } else {
    await host.getByRole('button', { name: 'Continue' }).click({ timeout: 3000 }).catch(() => {})
  }
  await host.getByRole('link', { name: 'Scorecards' }).click()
  await host.getByRole('link', { name: /Play 9/i }).click()
  await host.getByPlaceholder('Enter a name').fill('Pat')
  await host.getByRole('button', { name: 'Continue' }).click()
  await host.getByRole('button', { name: 'Create scorecard' }).click()
  await host.waitForURL(/\/room\/[A-Z0-9]+/)
  const code = host.url().match(/\/room\/([A-Z0-9]+)/)?.[1]
  if (!code) throw new Error('no code')
  console.log('created', code)

  const joinCtx = await browser.newContext()
  const joiner = await joinCtx.newPage()
  await joiner.goto(`${BASE}/join/${code}`)
  await joiner.getByPlaceholder('Enter a name').fill('Kid')
  await joiner.getByRole('button', { name: 'Continue' }).click()
  await joiner.waitForURL(new RegExp(`/room/${code}`))
  await host.waitForFunction(() => /Kid/i.test(document.body.innerText), null, { timeout: 20000 })

  await host.getByRole('button', { name: 'Start scorecard' }).click()
  await host.waitForFunction(() => /Round 1/i.test(document.body.innerText), null, { timeout: 15000 })
  await joiner.waitForFunction(() => /Round 1/i.test(document.body.innerText), null, { timeout: 20000 })

  // Both enter round 1 scores
  await host.locator('input[type="number"]').fill('4')
  await host.getByRole('button', { name: /Submit score/i }).click()
  await joiner.locator('input[type="number"]').fill('7')
  await joiner.getByRole('button', { name: /Submit score/i }).click()

  await host.waitForFunction(() => /Everyone has entered a score/i.test(document.body.innerText), null, {
    timeout: 20000,
  })
  await host.getByRole('button', { name: /Start next round/i }).click()

  // Joiner must advance to Round 2 without refreshing
  await joiner.waitForFunction(() => /Round 2/i.test(document.body.innerText), null, { timeout: 25000 })
  const text = await joiner.locator('main').innerText()
  console.log('joiner after next round:\n', text.slice(0, 400))
  if (!/Round 2/i.test(text)) throw new Error('joiner stuck on previous round')

  await browser.close()
  console.log('OK next-round sync', code)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
