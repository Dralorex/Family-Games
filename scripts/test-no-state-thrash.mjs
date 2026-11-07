import { chromium } from 'playwright'

const BASE = 'http://127.0.0.1:4173/Family-Games'

async function main() {
  const browser = await chromium.launch({ headless: true })
  const host = await browser.newContext()
  const page = await host.newPage()

  await page.goto(`${BASE}/`)
  await page.getByRole('link', { name: 'Games' }).click()
  await page.getByRole('link', { name: /Hot Potato/i }).click()
  await page.getByPlaceholder('Enter a name').fill('Pat')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: 'Create room' }).click()
  await page.waitForURL(/\/room\/[A-Z0-9]+/)
  const code = page.url().match(/\/room\/([A-Z0-9]+)/)?.[1]
  console.log('created', code)

  const joiner = await browser.newContext()
  const pageJ = await joiner.newPage()
  await pageJ.goto(`${BASE}/join/${code}`)
  await pageJ.getByPlaceholder('Enter a name').fill('Kid')
  await pageJ.getByRole('button', { name: 'Continue' }).click()
  await pageJ.waitForURL(new RegExp(`/room/${code}`))
  await page.waitForFunction(() => document.body.innerText.includes('Kid'), null, {
    timeout: 20000,
  })

  await page.getByRole('button', { name: 'Start game' }).click()
  await page.waitForFunction(() => /Passing|Time!|still in/i.test(document.body.innerText), null, {
    timeout: 10000,
  })

  // Sample UI for 4s — lobby copy must not keep flipping back in
  let lobbyHits = 0
  let playingHits = 0
  const end = Date.now() + 4000
  while (Date.now() < end) {
    const text = await page.locator('main').innerText()
    if (/Waiting for host to start|Start game/i.test(text)) lobbyHits += 1
    if (/Passing|Time!|still in|Explode/i.test(text)) playingHits += 1
    await page.waitForTimeout(100)
  }

  console.log({ lobbyHits, playingHits })
  if (lobbyHits > 2) {
    throw new Error(`UI thrashed back to lobby ${lobbyHits} times after start`)
  }
  if (playingHits < 10) {
    throw new Error(`Playing UI barely stable (hits=${playingHits})`)
  }

  await browser.close()
  console.log('OK no lobby/playing thrash after start')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
