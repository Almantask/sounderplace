import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { parseFeedback } from '../shared/feedback.ts'
import { checkoutKind, isFreePack, upgradeDeltaCents } from '../shared/pricing.ts'
import {
  allowRateLimitedRequest,
  allowUnpaidDevGrant,
  allowedCorsOrigin,
  apiSecurityHeaders,
  appUrlConfigError,
  audioContentType,
  clientIp,
  downloadFilename,
  grantedCheckoutLicense,
  parseCheckoutLicense,
  parseDonateCents,
  parsePackWebhookGrant,
  parseSignUpInput,
  pickVerifiedGithubEmail,
  requestHostname,
  SlidingWindowLimiter,
} from '../shared/security.ts'
import { ECOSYSTEM_LINKS } from '../shared/ecosystem.ts'
import {
  clearOauthStateCookie,
  clearSessionCookie,
  createOAuthState,
  createSession,
  createUser,
  deleteSession,
  getSessionUser,
  readOAuthStateCookie,
  sessionCookie,
  verifyOAuthState,
  verifyPasswordOrDummy,
  type AuthUser,
} from './auth.ts'
import type { Env } from './env.ts'
import {
  adminGate,
  createAdminPack,
  createAdminTrack,
  deleteAdminPack,
  deleteAdminTrack,
  getAdminPack,
  listAdminPacks,
  readUploadFile,
  sessionUser,
  storePackArchive,
  storeTrackAudio,
  updateAdminPack,
} from './lib/admin.ts'
import {
  entitledToVersion,
  featuredPackIds,
  getEntitlement,
  getPack,
  grantEntitlement,
  listPacks,
  packFiltersFromUrl,
  recordDownload,
} from './lib/catalog.ts'
import { ensureSeed } from './lib/seed.ts'
import { licenseUnitAmount, stripeRequest, verifyStripeSignature } from './lib/stripe.ts'

const app = new Hono<{ Bindings: Env; Variables: { user: AuthUser | null } }>()
const authLimiter = new SlidingWindowLimiter(10, 15 * 60 * 1000)
const actionLimiter = new SlidingWindowLimiter(8, 15 * 60 * 1000)

// Refuse to serve a deployment whose APP_URL cannot support secure cookies or CORS,
// rather than silently handing out non-Secure sessions.
app.use('*', async (c, next) => {
  const misconfigured = appUrlConfigError(c.env)
  if (misconfigured) return c.json({ error: `Server misconfigured: ${misconfigured}` }, 500)
  await next()
})

app.get('/', (c) => c.json({ ok: true, name: 'sunderplace-api' }))

app.use('*', async (c, next) => {
  await next()
  for (const [key, value] of Object.entries(apiSecurityHeaders(c.env.APP_URL))) {
    c.header(key, value)
  }
})

app.use('/api/*', async (c, next) => {
  const middleware = cors({
    origin: (origin) => allowedCorsOrigin(origin, c.env.APP_URL) ?? '',
    credentials: true,
  })
  return middleware(c, next)
})

app.use('/api/*', async (c, next) => {
  c.set('user', await getSessionUser(c.env, c.req.raw))
  await next()
})

function jsonError(c: { json: (data: unknown, status?: number) => Response }, message: string, status = 400) {
  return c.json({ error: message }, status)
}

function rateLimit(limiter: SlidingWindowLimiter, binding: 'AUTH_RATE_LIMITER' | 'ACTION_RATE_LIMITER') {
  return async (
    c: {
      env: Env
      req: { raw: Request; path: string }
      json: (data: unknown, status?: number) => Response
    },
    next: () => Promise<void>,
  ) => {
    const allowed = await allowRateLimitedRequest({
      binding: c.env[binding],
      limiter,
      key: `${c.req.path}:${clientIp(c.req.raw)}`,
    })
    if (!allowed) return jsonError(c, 'Too many requests', 429)
    await next()
  }
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
  return c.json({ user: user ? sessionUser(user, c.env, c.req.raw) : null })
})

app.post('/api/auth/sign-up', rateLimit(authLimiter, 'AUTH_RATE_LIMITER'), async (c) => {
  const parsed = parseSignUpInput(await c.req.json().catch(() => ({})))
  if (!parsed.ok) return jsonError(c, parsed.error)
  const existing = await c.env.DB.prepare('SELECT id FROM user WHERE email = ?').bind(parsed.value.email).first()
  if (existing) return jsonError(c, 'Could not create account')
  try {
    const user = await createUser(c.env, parsed.value)
    const token = await createSession(c.env, user.id, c.req.raw)
    c.header('Set-Cookie', sessionCookie(token, cookieSecure(c.env)))
    return c.json({ user: sessionUser(user, c.env, c.req.raw) })
  } catch {
    return jsonError(c, 'Could not create account')
  }
})

app.post('/api/auth/sign-in', rateLimit(authLimiter, 'AUTH_RATE_LIMITER'), async (c) => {
  const body = await c.req.json<{ email?: string; password?: string }>().catch(() => ({} as { email?: string; password?: string }))
  if (!body.email || !body.password) return jsonError(c, 'Email and password are required')
  const row = await c.env.DB.prepare(
    `SELECT user.id as id, user.email as email, user.name as name, user.email_verified as email_verified,
            account.password as password
     FROM user JOIN account ON account.user_id = user.id
     WHERE user.email = ? AND account.provider_id = 'credential'`,
  )
    .bind(body.email.trim().toLowerCase())
    .first<{ id: string; email: string; name: string; email_verified: number; password: string }>()
  const passwordOk = await verifyPasswordOrDummy(body.password, row?.password)
  if (!row || !passwordOk) {
    return jsonError(c, 'Invalid email or password', 401)
  }
  const token = await createSession(c.env, row.id, c.req.raw)
  c.header('Set-Cookie', sessionCookie(token, cookieSecure(c.env)))
  return c.json({
    user: sessionUser(
      { id: row.id, email: row.email, name: row.name, emailVerified: Number(row.email_verified) === 1 },
      c.env,
      c.req.raw,
    ),
  })
})

app.post('/api/auth/sign-out', async (c) => {
  const body = await c.req.json<{ all?: boolean }>().catch(() => ({ all: false }))
  await deleteSession(c.env, c.req.raw, { all: body.all === true })
  c.header('Set-Cookie', clearSessionCookie(cookieSecure(c.env)))
  return c.json({ ok: true })
})

app.get('/api/auth/github', rateLimit(authLimiter, 'AUTH_RATE_LIMITER'), async (c) => {
  if (!c.env.GITHUB_CLIENT_ID) return jsonError(c, 'GitHub sign-in is not configured', 501)
  const { nonce, cookie } = await createOAuthState(c.env)
  c.header('Set-Cookie', cookie)
  const url = new URL('https://github.com/login/oauth/authorize')
  url.searchParams.set('client_id', c.env.GITHUB_CLIENT_ID)
  url.searchParams.set('redirect_uri', `${c.env.APP_URL}/api/auth/github/callback`)
  url.searchParams.set('scope', 'read:user user:email')
  url.searchParams.set('state', nonce)
  return c.redirect(url.toString())
})

app.get('/api/auth/github/callback', rateLimit(authLimiter, 'AUTH_RATE_LIMITER'), async (c) => {
  const secure = cookieSecure(c.env)
  const clearOauth = clearOauthStateCookie(secure)
  if (!c.env.GITHUB_CLIENT_ID || !c.env.GITHUB_CLIENT_SECRET) {
    c.header('Set-Cookie', clearOauth)
    return jsonError(c, 'GitHub sign-in is not configured', 501)
  }
  if (!(await verifyOAuthState(c.env.SESSION_SECRET, c.req.query('state'), readOAuthStateCookie(c.req.raw)))) {
    c.header('Set-Cookie', clearOauth)
    return jsonError(c, 'Invalid GitHub sign-in state', 401)
  }
  const code = c.req.query('code')
  if (!code) {
    c.header('Set-Cookie', clearOauth)
    return jsonError(c, 'Missing GitHub code')
  }
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
  if (!tokenJson.access_token) {
    c.header('Set-Cookie', clearOauth)
    return jsonError(c, 'GitHub token exchange failed', 401)
  }
  const userRes = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${tokenJson.access_token}`, 'User-Agent': 'sunderplace' },
  })
  const gh = (await userRes.json()) as { id: number; login: string; email?: string; name?: string }
  const emailsRes = await fetch('https://api.github.com/user/emails', {
    headers: { Authorization: `Bearer ${tokenJson.access_token}`, 'User-Agent': 'sunderplace' },
  })
  const emails = await emailsRes.json()
  const email = pickVerifiedGithubEmail(gh.email, emails)
  if (!email) {
    c.header('Set-Cookie', clearOauth)
    return jsonError(c, 'GitHub account has no verified email', 400)
  }
  const githubAccount = await c.env.DB.prepare(
    `SELECT user_id as userId FROM account WHERE provider_id = 'github' AND account_id = ?`,
  )
    .bind(String(gh.id))
    .first<{ userId: string }>()
  let user: AuthUser | null = null
  if (githubAccount) {
    const row = await c.env.DB.prepare('SELECT id, email, name, email_verified FROM user WHERE id = ?')
      .bind(githubAccount.userId)
      .first<{ id: string; email: string; name: string; email_verified: number }>()
    if (row) {
      user = { id: row.id, email: row.email, name: row.name, emailVerified: Number(row.email_verified) === 1 }
    }
  } else {
    const existing = await c.env.DB.prepare('SELECT id, email, name, email_verified FROM user WHERE email = ?')
      .bind(email)
      .first<{ id: string; email: string; name: string; email_verified: number }>()
    if (existing && Number(existing.email_verified) !== 1) {
      c.header('Set-Cookie', clearOauth)
      return jsonError(c, 'An account with that email already exists. Sign in with your password.')
    }
    if (existing) {
      const now = Date.now()
      await c.env.DB.prepare(
        `INSERT INTO account (id, account_id, provider_id, user_id, created_at, updated_at) VALUES (?, ?, 'github', ?, ?, ?)`,
      )
        .bind(crypto.randomUUID(), String(gh.id), existing.id, now, now)
        .run()
      user = { id: existing.id, email: existing.email, name: existing.name, emailVerified: true }
    } else {
      const id = crypto.randomUUID()
      const now = Date.now()
      const name = gh.name ?? gh.login
      await c.env.DB.batch([
        c.env.DB.prepare(
          `INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)`,
        ).bind(id, name, email, now, now),
        c.env.DB.prepare(
          `INSERT INTO account (id, account_id, provider_id, user_id, created_at, updated_at) VALUES (?, ?, 'github', ?, ?, ?)`,
        ).bind(crypto.randomUUID(), String(gh.id), id, now, now),
      ])
      user = { id, email, name, emailVerified: true }
    }
  }
  if (!user) {
    c.header('Set-Cookie', clearOauth)
    return jsonError(c, 'GitHub sign-in failed', 401)
  }
  const token = await createSession(c.env, user.id, c.req.raw)
  c.header('Set-Cookie', sessionCookie(token, secure))
  c.header('Set-Cookie', clearOauth, { append: true })
  return c.redirect(`${c.env.APP_URL}/library`)
})

/**
 * One gate in front of every admin route. Repeating the check inside each handler made it
 * possible to add a new admin route and silently forget it.
 */
app.use('/api/admin/*', async (c, next) => {
  const gate = adminGate(c.get('user'), c.env, c.req.raw)
  if (!gate.ok) return jsonError(c, gate.error, gate.status)
  await next()
})

app.get('/api/admin/packs', async (c) => c.json({ packs: await listAdminPacks(c.env) }))

app.get('/api/admin/packs/:slug', async (c) => {
  const pack = await getAdminPack(c.env, c.req.param('slug'))
  if (!pack) return jsonError(c, 'Pack not found', 404)
  return c.json({ pack })
})

app.post('/api/admin/packs', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const result = await createAdminPack(c.env, body)
  if (result.error) return jsonError(c, result.error, result.status)
  return c.json({ pack: result.pack }, 201)
})

app.patch('/api/admin/packs/:slug', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const result = await updateAdminPack(c.env, c.req.param('slug'), body)
  if (result.error) return jsonError(c, result.error, result.status)
  return c.json({ pack: result.pack })
})

app.delete('/api/admin/packs/:slug', async (c) => {
  const result = await deleteAdminPack(c.env, c.req.param('slug'))
  if (!result.ok) return jsonError(c, result.error, result.status)
  // A pack with purchases behind it is delisted rather than deleted, so say which happened.
  return c.json(
    result.archived
      ? { ok: true, archived: true, purchases: result.purchases }
      : { ok: true, archived: false, objectsRemoved: result.objectsRemoved },
  )
})

app.post('/api/admin/packs/:slug/tracks', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const result = await createAdminTrack(c.env, c.req.param('slug'), body)
  if (result.error) return jsonError(c, result.error, result.status)
  return c.json({ pack: result.pack }, 201)
})

app.delete('/api/admin/packs/:slug/tracks/:trackId', async (c) => {
  const result = await deleteAdminTrack(c.env, c.req.param('slug'), c.req.param('trackId'))
  if (result.error) return jsonError(c, result.error, result.status)
  return c.json({ pack: result.pack })
})

app.put('/api/admin/packs/:slug/tracks/:trackId/audio', async (c) => {
  const file = await readUploadFile(await c.req.formData())
  if (!file) return jsonError(c, 'Audio file is required')
  const result = await storeTrackAudio(c.env, c.req.param('slug'), c.req.param('trackId'), file)
  if (result.error) return jsonError(c, result.error, result.status)
  return c.json({ pack: result.pack })
})

app.put('/api/admin/packs/:slug/archive', async (c) => {
  const file = await readUploadFile(await c.req.formData())
  if (!file) return jsonError(c, 'Archive file is required')
  const result = await storePackArchive(c.env, c.req.param('slug'), file)
  if (result.error) return jsonError(c, result.error, result.status)
  return c.json({ pack: result.pack })
})

app.get('/api/packs', async (c) => {
  const packs = await listPacks(c.env, packFiltersFromUrl(new URL(c.req.url)))
  return c.json({ packs })
})

app.get('/api/featured', async (c) => {
  const ids = await featuredPackIds(c.env)
  if (ids.length === 0) return c.json({ packs: [] })
  const packs = await listPacks(c.env)
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
  // Free live packs are in everyone's library, but only for packs the user has no
  // entitlement row for -- otherwise the same pack renders twice. The synthetic row also
  // has to carry the pack's real current version: hardcoding 'v1' pointed the download
  // link at an archive that no longer exists once a free pack shipped v2.
  const rows = await c.env.DB.prepare(
    `WITH current_version AS (
       SELECT pv.pack_id, pv.version
       FROM pack_versions pv
       WHERE pv.published_at = (
         SELECT MAX(pv2.published_at) FROM pack_versions pv2 WHERE pv2.pack_id = pv.pack_id
       )
     )
     SELECT e.license, e.snapshot_version as snapshotVersion, p.slug, p.title, p.kind, p.category,
            cv.version as currentVersion
     FROM entitlements e
     JOIN packs p ON p.id = e.pack_id
     JOIN current_version cv ON cv.pack_id = p.id
     WHERE e.user_id = ?1
     UNION ALL
     SELECT 'snapshot' as license, cv.version as snapshotVersion, p.slug, p.title, p.kind, p.category,
            cv.version as currentVersion
     FROM packs p
     JOIN current_version cv ON cv.pack_id = p.id
     WHERE p.price_snapshot_cents = 0 AND p.price_update_pass_cents = 0 AND p.listing_status = 'live'
       AND NOT EXISTS (SELECT 1 FROM entitlements e2 WHERE e2.pack_id = p.id AND e2.user_id = ?1)
     ORDER BY title`,
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

app.post('/api/checkout', rateLimit(actionLimiter, 'ACTION_RATE_LIMITER'), async (c) => {
  const user = c.get('user')
  if (!user) return jsonError(c, 'Sign in required', 401)
  const body = await c.req.json<{ slug?: string; license?: string }>().catch(() => ({} as { slug?: string; license?: string }))
  const license = parseCheckoutLicense(body.license)
  if (!body.slug) return jsonError(c, 'slug and license are required')
  if (!license) return jsonError(c, 'license must be snapshot, update_pass, or upgrade')
  const pack = await getPack(c.env, body.slug)
  if (!pack) return jsonError(c, 'Pack not found', 404)
  if (isFreePack(pack.priceSnapshotCents, pack.priceUpdatePassCents)) {
    return jsonError(c, 'Free packs do not use checkout')
  }
  const entitlement = await getEntitlement(c.env, user.id, pack.id)
  if (license === 'upgrade' && entitlement?.license !== 'snapshot') {
    return jsonError(c, 'Upgrade requires an existing snapshot license')
  }
  if (entitlement?.license === 'update_pass') return jsonError(c, 'You already have the update pass')
  const amount = licenseUnitAmount({
    license,
    snapshotCents: pack.priceSnapshotCents,
    updatePassCents: pack.priceUpdatePassCents,
  })
  const grantedLicense = grantedCheckoutLicense(license)
  if (!c.env.STRIPE_SECRET_KEY) {
    if (
      allowUnpaidDevGrant({
        allowDevLogin: c.env.ALLOW_DEV_LOGIN,
        appUrl: c.env.APP_URL,
        stripeSecretKey: c.env.STRIPE_SECRET_KEY,
        requestHostname: requestHostname(c.req.raw),
      })
    ) {
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
    'metadata[checkoutLicense]': license,
    'metadata[license]': grantedLicense,
    'metadata[userId]': user.id,
    'metadata[version]': pack.currentVersion,
  })
  return c.json({ url: session.url })
})

app.post('/api/feedback', rateLimit(actionLimiter, 'ACTION_RATE_LIMITER'), async (c) => {
  const body = await c.req.json<{ name?: string; email?: string; category?: string; message?: string }>().catch(() => ({}))
  const parsed = parseFeedback(body)
  if (!parsed.ok) return jsonError(c, parsed.error)
  const user = c.get('user')
  await c.env.DB.prepare(
    `INSERT INTO feedback (id, user_id, name, email, category, message, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      user?.id ?? null,
      parsed.value.name,
      parsed.value.email,
      parsed.value.category,
      parsed.value.message,
      Date.now(),
    )
    .run()
  return c.json({ ok: true })
})

app.post('/api/donate', rateLimit(actionLimiter, 'ACTION_RATE_LIMITER'), async (c) => {
  const body = await c.req.json<{ amountCents?: number }>().catch(() => ({ amountCents: undefined }))
  const amount = parseDonateCents(body.amountCents, Number(c.env.DONATE_CENTS ?? '500'))
  if (amount === null) return jsonError(c, 'Donation must be a whole amount between $1 and $500')
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
  let event: {
    type: string
    data: { object: { id: string; amount_total?: number; metadata?: Record<string, string>; payment_intent?: string } }
  }
  try {
    event = JSON.parse(payload) as typeof event
  } catch {
    return jsonError(c, 'Invalid payload', 400)
  }
  if (event.type !== 'checkout.session.completed') return c.json({ received: true })
  const session = event.data.object
  const meta = session.metadata ?? {}
  if (meta.type === 'donate') {
    const donated = parseDonateCents(session.amount_total ?? null, Number.NaN)
    if (donated === null) return c.json({ received: true })
    await c.env.DB.prepare(
      `INSERT OR IGNORE INTO donations (id, user_id, amount_cents, stripe_session_id, created_at) VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(crypto.randomUUID(), meta.userId || null, donated, session.id, Date.now())
      .run()
    return c.json({ received: true })
  }
  const packRow = meta.packId
    ? await c.env.DB.prepare(
        `SELECT id, price_snapshot_cents as priceSnapshotCents, price_update_pass_cents as priceUpdatePassCents FROM packs WHERE id = ?`,
      )
        .bind(meta.packId)
        .first<{ id: string; priceSnapshotCents: number; priceUpdatePassCents: number }>()
    : null
  const versionRows = packRow
    ? await c.env.DB.prepare(`SELECT version FROM pack_versions WHERE pack_id = ?`)
        .bind(packRow.id)
        .all<{ version: string }>()
    : { results: [] as Array<{ version: string }> }
  const grant = parsePackWebhookGrant({
    metadata: meta,
    amountTotal: session.amount_total,
    pack: packRow
      ? {
          id: packRow.id,
          priceSnapshotCents: packRow.priceSnapshotCents,
          priceUpdatePassCents: packRow.priceUpdatePassCents,
          versions: (versionRows.results ?? []).map((row) => row.version),
        }
      : null,
  })
  if (!grant.ok) return c.json({ received: true })
  const buyer = await c.env.DB.prepare('SELECT id FROM user WHERE id = ?').bind(grant.value.userId).first()
  if (!buyer) return c.json({ received: true })
  await grantEntitlement(c.env, {
    userId: grant.value.userId,
    packId: grant.value.packId,
    license: grant.value.license,
    version: grant.value.version,
  })
  await c.env.DB.prepare(
    `INSERT OR IGNORE INTO purchases (id, user_id, pack_id, license, amount_cents, stripe_session_id, stripe_payment_intent_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      grant.value.userId,
      grant.value.packId,
      grant.value.license,
      grant.value.amountCents,
      session.id,
      session.payment_intent ?? null,
      Date.now(),
    )
    .run()
  return c.json({ received: true })
})

app.get('/api/previews/:trackId', async (c) => {
  await ensureSeed(c.env.DB)
  const track = await c.env.DB.prepare(
    `SELECT t.preview_r2_key as preview_r2_key
     FROM tracks t
     JOIN pack_versions pv ON pv.id = t.pack_version_id
     JOIN packs p ON p.id = pv.pack_id
     WHERE t.id = ?
       AND p.listing_status = 'live'
       AND t.preview_r2_key IS NOT NULL
       AND t.sort_order = (
         SELECT MIN(t2.sort_order) FROM tracks t2 WHERE t2.pack_version_id = t.pack_version_id
       )
       AND pv.version = (
         SELECT version FROM pack_versions pv2 WHERE pv2.pack_id = p.id ORDER BY published_at DESC LIMIT 1
       )`,
  )
    .bind(c.req.param('trackId'))
    .first<{ preview_r2_key: string }>()
  if (!track?.preview_r2_key) return jsonError(c, 'Preview not found', 404)
  const object = await c.env.AUDIO.get(track.preview_r2_key)
  if (!object) return jsonError(c, 'Preview file is not ingested yet', 404)
  const extIndex = track.preview_r2_key.lastIndexOf('.')
  const ext = extIndex >= 0 ? track.preview_r2_key.slice(extIndex).toLowerCase() : '.ogg'
  return new Response(object.body, {
    headers: {
      'Content-Type': audioContentType(ext),
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  })
})

app.get('/api/downloads/:slug/:version', async (c) => {
  const user = c.get('user')
  if (!user) return jsonError(c, 'Sign in required', 401)
  const pack = await getPack(c.env, c.req.param('slug'))
  if (!pack) return jsonError(c, 'Pack not found', 404)
  const version = c.req.param('version')
  const filename = downloadFilename(pack.slug, version)
  if (!filename) return jsonError(c, 'Unknown pack version', 400)
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
      'Content-Disposition': `attachment; filename="${filename}"`,
      'X-Content-Type-Options': 'nosniff',
    },
  })
})

export default app
