/**
 * Capture README screenshots from a running local app.
 *
 *   npm run dev:full
 *   npm install --no-save puppeteer-core
 *   node scripts/capture-readme-screenshots.mjs
 *
 * Chrome is required (`CHROME_PATH` if it is not on a standard path).
 */
import { access, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = path.join(ROOT, 'docs', 'screenshots')
const BASE = process.env.APP_URL ?? 'http://127.0.0.1:5173'
const VIEWPORT = { width: 1440, height: 980, deviceScaleFactor: 1 }

async function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH
  for (const candidate of ['/usr/local/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/google-chrome']) {
    try {
      await access(candidate)
      return candidate
    } catch {
      /* try next */
    }
  }
  throw new Error('Chrome not found. Set CHROME_PATH.')
}

async function clickText(page, selector, text) {
  const clicked = await page.evaluate(
    (sel, wanted) => {
      const nodes = [...document.querySelectorAll(sel)]
      const node = nodes.find((el) => el.textContent?.trim() === wanted)
      node?.click()
      return Boolean(node)
    },
    selector,
    text,
  )
  if (!clicked) throw new Error(`Could not click ${selector} with text "${text}"`)
}

async function shot(page, name) {
  await page.waitForSelector('header a.font-display', { timeout: 20_000 })
  await page.evaluate(() => document.fonts.ready)
  await new Promise((resolve) => setTimeout(resolve, 400))
  await page.screenshot({ path: path.join(OUT_DIR, `${name}.png`), type: 'png' })
  console.log('wrote', `docs/screenshots/${name}.png`)
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  const browser = await puppeteer.launch({
    executablePath: await chromePath(),
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', `--window-size=${VIEWPORT.width},${VIEWPORT.height}`],
    defaultViewport: VIEWPORT,
  })
  const page = await browser.newPage()
  page.setDefaultTimeout(20_000)

  await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' })
  await page.waitForFunction(() => !document.body.innerText.includes('Loading featured packs'))
  await shot(page, 'home')

  await clickText(page, 'button', 'Sign in')
  await page.waitForSelector('#auth-title')
  await new Promise((resolve) => setTimeout(resolve, 300))
  await shot(page, 'sign-in')
  await clickText(page, 'button', 'Cancel')

  await page.goto(`${BASE}/catalog`, { waitUntil: 'networkidle0' })
  await page.waitForFunction(() => !document.body.innerText.includes('Loading packs'))
  await shot(page, 'catalog')

  await page.goto(`${BASE}/packs/beast-hunt-i`, { waitUntil: 'networkidle0' })
  await page.waitForFunction(() => document.body.innerText.includes('Beast Hunt I'))
  await shot(page, 'pack-free')

  await page.goto(`${BASE}/packs/beast-hunt-ii`, { waitUntil: 'networkidle0' })
  await page.waitForFunction(() => document.body.innerText.includes('Beast Hunt II'))
  await shot(page, 'pack-paid')

  await page.goto(`${BASE}/ecosystem`, { waitUntil: 'networkidle0' })
  await page.waitForFunction(() => document.body.innerText.includes('Thunder FX'))
  await shot(page, 'ecosystem')

  await page.goto(`${BASE}/faq`, { waitUntil: 'networkidle0' })
  await shot(page, 'faq')

  await page.goto(`${BASE}/feedback`, { waitUntil: 'networkidle0' })
  await shot(page, 'feedback')

  const signedIn = await page.evaluate(async () => {
    const response = await fetch('/api/auth/sign-up', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Operator',
        email: `operator-${Date.now()}@example.com`,
        password: 'correct horse',
      }),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error ?? 'sign-up failed')
    const claim = await fetch('/api/packs/beast-hunt-i/claim', { method: 'POST', credentials: 'include' })
    if (!claim.ok) throw new Error((await claim.json().catch(() => ({}))).error ?? 'claim failed')
    return data.user
  })
  console.log('signed in as', signedIn.email, 'admin=', signedIn.isAdmin)

  await page.goto(`${BASE}/library`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => document.body.innerText.includes('Beast Hunt'))
  await shot(page, 'library')

  await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => document.body.innerText.includes('Catalog admin'))
  await shot(page, 'admin')

  await page.goto(`${BASE}/admin/packs/beast-hunt-ii`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => document.body.innerText.includes('Beast Hunt II'))
  await shot(page, 'admin-pack')

  await browser.close()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
