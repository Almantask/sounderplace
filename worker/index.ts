import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { checkoutKind, isFreePack, upgradeDeltaCents } from '../shared/pricing.ts'
import { ECOSYSTEM_LINKS } from '../shared/starter-library.ts'
import {
  clearSessionCookie,
  createSession,
  createUser,
  getSessionUser,
  sessionCookie,
  verifyPassword,
  type AuthUser,
} from './auth.ts'
import type { Env } from './env.ts'
import {
  entitledToVersion,
  featuredPackIds,
  getEntitlement,
  getPack,
  grantEntitlement,
  listPacks,
  recordDownload,
} from './lib/catalog.ts'
import { ensureSeed } from './lib/seed.ts'
import { licenseUnitAmount, stripeRequest } from './lib/stripe.ts'

const app = new Hono<{ Bindings: Env; Variables: { user: AuthUser | null } }>()

app.get('/', (c) => c.json({ ok: true, name: 'sunderplace-api' }))

app.use(
  '/api/*',
  cors({
    origin: (origin) => origin,
    credentials: true,
  }),
)

app.use('/api/*', async (c, next) => {
  c.set('user', await getSessionUser(c.env, c.req.raw))
  await next()
})

function jsonError(c: { json: (data: unknown, status?: number) => Response }, message: string, status = 400) {
  return c.json({ error: message }, status)
}

function cookieSecure(env: Env): boolean {
  return env.APP_URL.startsWith('https://')
}

app.get('/api/health', (c) => c.json({ ok: true, name: 'sunderplace' }))

app.get('/api/ecosystem', (c) =>
  c.json({
    links: ECOSYSTEM_LINKS,
    donate: {
      defaultCents: Number(c.env.DONATE_CENTS ?? '500'),
      githubSponsors: 'https://github.com/sponsors/Almantask',
      kofi: 'https://ko-fi.com/almantask',
    },
  }),
)

app.get('/api/session', (c) => {
  const user = c.get('user')
  return c.json({ user })
})

app.post('/api/auth/sign-up', async (c) => {
  const body = await c.req.json<{ email?: string; password?: string; name?: string }>()
  if (!body.email || !body.password || !body.name) return jsonError(c, 'Name, email, and password are required')
  const existing = await c.env.DB.prepare('SELECT id FROM user WHERE email = ?').bind(body.email.toLowerCase()).first()
  if (existing) return jsonError(c, 'An account with that email already exists', 409)
  const user = await createUser(c.env, { email: body.email, name: body.name, password: body.password })
  const token = await createSession(c.env, user.id, c.req.raw)
  c.header('Set-Cookie', sessionCookie(token, cookieSecure(c.env)))
  return c.json({ user })
})

app.post('/api/auth/sign-in', async (c) => {
  const body = await c.req.json<{ email?: string; password?: string }>()
  if (!body.email || !body.password) return jsonError(c, 'Email and password are required')
  const row = await c.env.DB.prepare(
    `SELECT user.id as id, user.email as email, user.name as name, account.password as password
     FROM user JOIN account ON account.user_id = user.id
     WHERE user.email = ? AND account.provider_id = 'credential'`,
  )
    .bind(body.email.toLowerCase())
    .first<{ id: string; email: string; name: string; password: string }>()
  if (!row || !(await verifyPassword(body.password, row.password))) {
    return jsonError(c, 'Invalid email or password', 401)
  }
  const token = await createSession(c.env, row.id, c.req.raw)
  c.header('Set-Cookie', sessionCookie(token, cookieSecure(c.env)))
  return c.json({ user: { id: row.id, email: row.email, name: row.name } })
})

app.post('/api/auth/sign-out', (c) => {
  c.header('Set-Cookie', clearSessionCookie(cookieSecure(c.env)))
  return c.json({ ok: true })
})

app.get('/api/auth/github', (c) => {
  if (!c.env.GITHUB_CLIENT_ID) return jsonError(c, 'GitHub sign-in is not configured', 501)
  const url = new URL('https://github.com/login/oauth/authorize')
  url.searchParams.set('client_id', c.env.GITHUB_CLIENT_ID)
  url.searchParams.set('redirect_uri', `${c.env.APP_URL}/api/auth/github/callback`)
  url.searchParams.set('scope', 'read:user user:email')
  return c.redirect(url.toString())
})

app.get('/api/auth/github/callback', async (c) => {
  if (!c.env.GITHUB_CLIENT_ID || !c.env.GITHUB_CLIENT_SECRET) return jsonError(c, 'GitHub sign-in is not configured', 501)
  const code = c.req.query('code')
  if (!code) return jsonError(c, 'Missing GitHub code')
  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: c.env.GITHUB_CLIENT_ID,
      client_secret: c.env.GITHUB_CLIENT_SECRET,
      code,
    }),
  })
  const tokenJson = (await tokenRes.json()) as { access_token?: string }
  if (!tokenJson.access_token) return jsonError(c, 'GitHub token exchange failed', 401)
  const userRes = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${tokenJson.access_token}`, 'User-Agent': 'sunderplace' },
  })
  const gh = (await userRes.json()) as { id: number; login: string; email?: string; name?: string }
  const emailsRes = await fetch('https://api.github.com/user/emails', {
    headers: { Authorization: `Bearer ${tokenJson.access_token}`, 'User-Agent': 'sunderplace' },
  })
  const emails = (await emailsRes.json()) as Array<{ email: string; primary: boolean; verified: boolean }>
  const email = gh.email ?? emails.find((row) => row.primary && row.verified)?.email ?? emails[0]?.email
  if (!email) return jsonError(c, 'GitHub account has no email', 400)
  let user = await c.env.DB.prepare('SELECT id, email, name FROM user WHERE email = ?')
    .bind(email.toLowerCase())
    .first<AuthUser>()
  if (!user) {
    const id = crypto.randomUUID()
    const now = Date.now()
    const name = gh.name ?? gh.login
    await c.env.DB.prepare(
      `INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)`,
    )
      .bind(id, name, email.toLowerCase(), now, now)
      .run()
    await c.env.DB.prepare(
      `INSERT INTO account (id, account_id, provider_id, user_id, created_at, updated_at) VALUES (?, ?, 'github', ?, ?, ?)`,
    )
      .bind(crypto.randomUUID(), String(gh.id), id, now, now)
      .run()
    user = { id, email: email.toLowerCase(), name }
  }
  const token = await createSession(c.env, user.id, c.req.raw)
  c.header('Set-Cookie', sessionCookie(token, cookieSecure(c.env)))
  return c.redirect(`${c.env.APP_URL}/library`)
})

app.get('/api/packs', async (c) => {
  const packs = await listPacks(c.env, new URL(c.req.url))
  return c.json({ packs })
})

app.get('/api/featured', async (c) => {
  await ensureSeed(c.env.DB)
  const ids = await featuredPackIds(c.env)
  if (ids.length === 0) return c.json({ packs: [] })
  const packs = await listPacks(c.env, new URL(c.env.APP_URL))
  return c.json({ packs: packs.filter((pack) => ids.includes(pack.id)) })
})

app.get('/api/packs/:slug', async (c) => {
  const pack = await getPack(c.env, c.req.param('slug'))
  if (!pack) return jsonError(c, 'Pack not found', 404)
  const user = c.get('user')
  const entitlement = user ? await getEntitlement(c.env, user.id, pack.id) : null
  const kind = checkoutKind({
    priceSnapshotCents: pack.priceSnapshotCents,
    priceUpdatePassCents: pack.priceUpdatePassCents,
    alreadyOwnsSnapshot: Boolean(entitlement),
    alreadyOwnsUpdatePass: entitlement?.license === 'update_pass',
  })
  return c.json({
    pack,
    entitlement: entitlement
      ? { packId: pack.id, license: entitlement.license, snapshotVersion: entitlement.snapshot_version }
      : null,
    checkoutKind: kind,
    upgradeDeltaCents:
      kind === 'upgrade' ? upgradeDeltaCents(pack.priceSnapshotCents, pack.priceUpdatePassCents) : 0,
  })
})

app.get('/api/library', async (c) => {
  const user = c.get('user')
  if (!user) return jsonError(c, 'Sign in required', 401)
  await ensureSeed(c.env.DB)
  const rows = await c.env.DB.prepare(
    `SELECT e.license, e.snapshot_version as snapshotVersion, p.slug, p.title, p.kind, p.category,
            (SELECT version FROM pack_versions pv WHERE pv.pack_id = p.id ORDER BY published_at DESC LIMIT 1) as currentVersion
     FROM entitlements e JOIN packs p ON p.id = e.pack_id
     WHERE e.user_id = ?
     UNION
     SELECT 'snapshot' as license, 'v1' as snapshotVersion, p.slug, p.title, p.kind, p.category,
            (SELECT version FROM pack_versions pv WHERE pv.pack_id = p.id ORDER BY published_at DESC LIMIT 1) as currentVersion
     FROM packs p
     WHERE p.price_snapshot_cents = 0 AND p.price_update_pass_cents = 0 AND p.listing_status = 'live'`,
  )
    .bind(user.id)
    .all()
  return c.json({ items: rows.results ?? [] })
})

app.post('/api/packs/:slug/claim', async (c) => {
  const user = c.get('user')
  if (!user) return jsonError(c, 'Sign in required', 401)
  const pack = await getPack(c.env, c.req.param('slug'))
  if (!pack) return jsonError(c, 'Pack not found', 404)
  if (!isFreePack(pack.priceSnapshotCents, pack.priceUpdatePassCents)) {
    return jsonError(c, 'This pack is paid. Use checkout instead.')
  }
  await grantEntitlement(c.env, {
    userId: user.id,
    packId: pack.id,
    license: 'snapshot',
    version: pack.currentVersion,
  })
  return c.json({ ok: true })
})

app.post('/api/checkout', async (c) => {
  const user = c.get('user')
  if (!user) return jsonError(c, 'Sign in required', 401)
  const body = await c.req.json<{ slug?: string; license?: 'snapshot' | 'update_pass' | 'upgrade' }>()
  if (!body.slug || !body.license) return jsonError(c, 'slug and license are required')
  const pack = await getPack(c.env, body.slug)
  if (!pack) return jsonError(c, 'Pack not found', 404)
  if (isFreePack(pack.priceSnapshotCents, pack.priceUpdatePassCents)) {
    return jsonError(c, 'Free packs do not use checkout')
  }
  const entitlement = await getEntitlement(c.env, user.id, pack.id)
  if (body.license === 'upgrade' && entitlement?.license !== 'snapshot') {
    return jsonError(c, 'Upgrade requires an existing snapshot license')
  }
  if (entitlement?.license === 'update_pass') return jsonError(c, 'You already have the update pass')
  const amount = licenseUnitAmount({
    license: body.license,
    snapshotCents: pack.priceSnapshotCents,
    updatePassCents: pack.priceUpdatePassCents,
  })
  const grantedLicense = body.license === 'snapshot' ? 'snapshot' : 'update_pass'
  if (!c.env.STRIPE_SECRET_KEY) {
    if (c.env.ALLOW_DEV_LOGIN === '1') {
      await grantEntitlement(c.env, {
        userId: user.id,
        packId: pack.id,
        license: grantedLicense,
        version: pack.currentVersion,
      })
      await c.env.DB.prepare(
        `INSERT INTO purchases (id, user_id, pack_id, license, amount_cents, stripe_session_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(crypto.randomUUID(), user.id, pack.id, grantedLicense, amount, `dev_${crypto.randomUUID()}`, Date.now())
        .run()
      return c.json({ url: `${c.env.APP_URL}/library?granted=${pack.slug}` })
    }
    return jsonError(c, 'Payments are not configured', 501)
  }
  const session = await stripeRequest(c.env.STRIPE_SECRET_KEY, 'checkout/sessions', {
    mode: 'payment',
    success_url: `${c.env.APP_URL}/library?purchased=${pack.slug}`,
    cancel_url: `${c.env.APP_URL}/packs/${pack.slug}`,
    customer_email: user.email,
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': String(amount),
    'line_items[0][price_data][product_data][name]': `${pack.title} (${grantedLicense === 'snapshot' ? 'snapshot' : 'update pass'})`,
    'metadata[type]': 'pack',
    'metadata[packId]': pack.id,
    'metadata[license]': grantedLicense,
    'metadata[userId]': user.id,
    'metadata[version]': pack.currentVersion,
  })
  return c.json({ url: session.url })
})

app.post('/api/donate', async (c) => {
  const body = await c.req.json<{ amountCents?: number }>().catch(() => ({ amountCents: undefined }))
  const amount = body.amountCents ?? Number(c.env.DONATE_CENTS ?? '500')
  if (amount < 100) return jsonError(c, 'Minimum donation is $1')
  const user = c.get('user')
  if (!c.env.STRIPE_SECRET_KEY) {
    return c.json({
      url: 'https://ko-fi.com/almantask',
      fallback: true,
    })
  }
  const session = await stripeRequest(c.env.STRIPE_SECRET_KEY, 'checkout/sessions', {
    mode: 'payment',
    success_url: `${c.env.APP_URL}/ecosystem?donated=1`,
    cancel_url: `${c.env.APP_URL}/ecosystem`,
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': String(amount),
    'line_items[0][price_data][product_data][name]': 'Sunderplace donation',
    'metadata[type]': 'donate',
    'metadata[userId]': user?.id ?? '',
  })
  return c.json({ url: session.url })
})

app.post('/api/stripe/webhook', async (c) => {
  if (!c.env.STRIPE_WEBHOOK_SECRET || !c.env.STRIPE_SECRET_KEY) {
    return jsonError(c, 'Webhook not configured', 501)
  }
  const payload = await c.req.text()
  const header = c.req.header('stripe-signature')
  if (!header) return jsonError(c, 'Missing signature', 400)
  if (!(await verifyStripeSignature(payload, header, c.env.STRIPE_WEBHOOK_SECRET))) {
    return jsonError(c, 'Invalid signature', 400)
  }
  const event = JSON.parse(payload) as {
    type: string
    data: { object: { id: string; metadata?: Record<string, string>; payment_intent?: string } }
  }
  if (event.type !== 'checkout.session.completed') return c.json({ received: true })
  const session = event.data.object
  const meta = session.metadata ?? {}
  if (meta.type === 'donate') {
    await c.env.DB.prepare(
      `INSERT OR IGNORE INTO donations (id, user_id, amount_cents, stripe_session_id, created_at) VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(crypto.randomUUID(), meta.userId || null, 0, session.id, Date.now())
      .run()
    return c.json({ received: true })
  }
  if (meta.type === 'pack' && meta.userId && meta.packId && meta.license && meta.version) {
    await grantEntitlement(c.env, {
      userId: meta.userId,
      packId: meta.packId,
      license: meta.license as 'snapshot' | 'update_pass',
      version: meta.version,
    })
    await c.env.DB.prepare(
      `INSERT OR IGNORE INTO purchases (id, user_id, pack_id, license, amount_cents, stripe_session_id, stripe_payment_intent_id, created_at)
       VALUES (?, ?, ?, ?, 0, ?, ?, ?)`,
    )
      .bind(
        crypto.randomUUID(),
        meta.userId,
        meta.packId,
        meta.license,
        session.id,
        session.payment_intent ?? null,
        Date.now(),
      )
      .run()
  }
  return c.json({ received: true })
})

app.get('/api/previews/:trackId', async (c) => {
  await ensureSeed(c.env.DB)
  const track = await c.env.DB.prepare('SELECT preview_r2_key FROM tracks WHERE id = ?')
    .bind(c.req.param('trackId'))
    .first<{ preview_r2_key: string | null }>()
  if (!track?.preview_r2_key) return jsonError(c, 'Preview not found', 404)
  const object = await c.env.AUDIO.get(track.preview_r2_key)
  if (!object) return jsonError(c, 'Preview file is not ingested yet', 404)
  return new Response(object.body, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType ?? 'audio/ogg',
      'Cache-Control': 'public, max-age=3600',
    },
  })
})

app.get('/api/downloads/:slug/:version', async (c) => {
  const user = c.get('user')
  if (!user) return jsonError(c, 'Sign in required', 401)
  const pack = await getPack(c.env, c.req.param('slug'))
  if (!pack) return jsonError(c, 'Pack not found', 404)
  const version = c.req.param('version')
  const entitlement = await getEntitlement(c.env, user.id, pack.id)
  const free = isFreePack(pack.priceSnapshotCents, pack.priceUpdatePassCents)
  if (!entitledToVersion(entitlement, pack.id, version, free)) {
    return jsonError(c, 'You do not have a license for this version', 403)
  }
  if (free && !entitlement) {
    await grantEntitlement(c.env, { userId: user.id, packId: pack.id, license: 'snapshot', version })
  }
  await recordDownload(c.env, user.id, pack.id, version)
  const row = await c.env.DB.prepare(`SELECT zip_r2_key FROM pack_versions WHERE pack_id = ? AND version = ?`)
    .bind(pack.id, version)
    .first<{ zip_r2_key: string | null }>()
  if (!row?.zip_r2_key) return jsonError(c, 'Pack archive is missing', 404)
  const object = await c.env.AUDIO.get(row.zip_r2_key)
  if (!object) {
    return jsonError(c, 'Audio files are not ingested yet. Run the operator CLI.', 409)
  }
  return new Response(object.body, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${pack.slug}-${version}.zip"`,
    },
  })
})

async function verifyStripeSignature(payload: string, header: string, secret: string): Promise<boolean> {
  const parts = Object.fromEntries(
    header.split(',').map((item) => {
      const [k, v] = item.split('=')
      return [k.trim(), v]
    }),
  )
  const timestamp = parts.t
  const expected = parts.v1
  if (!timestamp || !expected) return false
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signed = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${payload}`))
  const digest = [...new Uint8Array(signed)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  return digest === expected
}

export default app
