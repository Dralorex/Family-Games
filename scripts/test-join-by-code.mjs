import { chromium } from 'playwright'

const BASE = 'http://127.0.0.1:4173/Family-Games'

async function main() {
  const browser = await chromium.launch({ headless: true })

  const hostCtx = await browser.newContext()
  const host = await hostCtx.newPage()
  await host.goto(`${BASE}/`)
  await host.getByRole('link', { name: 'Scorecards' }).click()
  await host.getByRole('link', { name: /Play 9/i }).click()
  await host.getByPlaceholder('Enter a name').fill('Pat')
  await host.getByRole('button', { name: 'Continue' }).click()
  await host.getByRole('button', { name: 'Create scorecard' }).click()
  await host.waitForURL(/\/room\/[A-Z0-9]+/)
  const code = host.url().match(/\/room\/([A-Z0-9]+)/)?.[1]
  if (!code) throw new Error('no code')
  console.log('host created', code)
  await host.waitForFunction(() => /Pat/i.test(document.body.innerText), null, { timeout: 15000 })
  await host.waitForTimeout(1500)

  const joinCtx = await browser.newContext()
  const joiner = await joinCtx.newPage()
  await joiner.goto(`${BASE}/join/${code}`)
  await joiner.getByPlaceholder('Enter a name').fill('Kid')
  await joiner.getByRole('button', { name: 'Continue' }).click()
  await joiner.waitForURL(new RegExp(`/room/${code}`), { timeout: 20000 })
  console.log('joiner navigated', joiner.url())

  // Must leave the stuck “Joining…” screen and see the lobby
  await joiner.waitForFunction(
    () => {
      const t = document.body.innerText
      if (/Your join is already sent/i.test(t)) return false
      return /Start scorecard|Waiting for game master|game master/i.test(t) && /Kid/i.test(t)
    },
    null,
    { timeout: 30000 },
  )

  // Host should also see the joiner
  await host.waitForFunction(() => /Kid/i.test(document.body.innerText), null, { timeout: 20000 })

  const text = await joiner.locator('main').innerText()
  console.log('joiner main:\n', text.slice(0, 500))
  if (/Your join is already sent|Joining…/i.test(text)) {
    throw new Error('still stuck on Joining screen')
  }

  await browser.close()
  console.log('OK join by code', code)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
