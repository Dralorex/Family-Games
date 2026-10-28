import { chromium } from 'playwright'

const BASE = 'http://127.0.0.1:4173/Family-Games'

async function main() {
  const browser = await chromium.launch({ headless: true })

  // Host creates lobby
  const hostA = await browser.newContext()
  const pageA = await hostA.newPage()
  await pageA.goto(`${BASE}/`)
  await pageA.getByRole('link', { name: 'Games' }).click()
  await pageA.getByRole('link', { name: /Hot Potato/i }).click()
  await pageA.getByPlaceholder('Enter a name').fill('Pat')
  await pageA.getByRole('button', { name: 'Continue' }).click()
  await pageA.getByRole('button', { name: 'Create room' }).click()
  await pageA.waitForURL(/\/room\/[A-Z0-9]+/)
  const code = pageA.url().match(/\/room\/([A-Z0-9]+)/)?.[1]
  if (!code) throw new Error('no code')
  console.log('created', code)
  await pageA.waitForTimeout(2000)

  // Player already connected before host switches browsers
  const joinC = await browser.newContext()
  const pageC = await joinC.newPage()
  await pageC.goto(`${BASE}/join/${code}`)
  await pageC.getByPlaceholder('Enter a name').fill('Kid')
  await pageC.getByRole('button', { name: 'Continue' }).click()
  await pageC.waitForURL(new RegExp(`/room/${code}`))
  await pageC.waitForFunction(
    () => document.body.innerText.includes('Kid') && document.body.innerText.includes('Pat'),
    null,
    { timeout: 20000 },
  )
  console.log('player connected before reclaim')

  // Close original host tab (simulates leaving browser without Leave)
  await pageA.close()
  await hostA.close()
  await pageC.waitForTimeout(1000)

  // New browser continues as host with owner name
  const hostB = await browser.newContext()
  const pageB = await hostB.newPage()
  await pageB.goto(`${BASE}/host`)
  await pageB.getByPlaceholder('Enter a name').fill('Pat')
  await pageB.getByRole('button', { name: 'Continue' }).click()
  await pageB.waitForURL(new RegExp(`/room/${code}`), { timeout: 20000 })
  console.log('reclaimed', pageB.url())

  // New host should see both seats; connected player should still see roster
  await pageB.waitForFunction(
    () => {
      const t = document.body.innerText
      return t.includes('Pat') && t.includes('Kid')
    },
    null,
    { timeout: 20000 },
  )
  console.log('new host sees Pat + Kid')

  await pageC.waitForFunction(
    () => {
      const t = document.body.innerText
      return t.includes('Pat') && t.includes('Kid')
    },
    null,
    { timeout: 20000 },
  )
  const after = await pageC.locator('main').innerText()
  console.log('connected player after reclaim:\n', after.slice(0, 500))
  if (!/2\/50/.test(after) && !/Kid/.test(after)) {
    throw new Error('connected player lost after host reclaim')
  }

  await browser.close()
  console.log('OK owner reclaim kept connected player', code)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
