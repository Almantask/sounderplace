import { licenseUnitAmount } from './pricing.ts'

export const MIN_PASSWORD_LENGTH = 8
export const MAX_PASSWORD_LENGTH = 128
export const MAX_NAME_LENGTH = 120
export const MIN_DONATE_CENTS = 100
export const MAX_DONATE_CENTS = 50_000
export const MAX_AUDIO_UPLOAD_BYTES = 40 * 1024 * 1024
export const MAX_ZIP_UPLOAD_BYTES = 100 * 1024 * 1024
export const STRIPE_SIGNATURE_TOLERANCE_SEC = 300
export const PACK_VERSION_RE = /^v\d+$/i
export const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
export const SESSION_IDLE_MS = 24 * 60 * 60 * 1000
export const SESSION_COOKIE_MAX_AGE_SEC = SESSION_MAX_AGE_MS / 1000

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const WEBHOOK_ID_RE = /^[a-zA-Z0-9_-]{8,64}$/

export const AUDIO_CONTENT_TYPES: Record<string, string> = {
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  '.mp3': 'audio/mpeg',
  '.opus': 'audio/ogg',
}

export type CheckoutLicense = 'snapshot' | 'update_pass' | 'upgrade'
export type SniffedUpload = 'ogg' | 'wav' | 'flac' | 'mp3' | 'zip'
export type RateLimitBinding = { limit: (options: { key: string }) => Promise<{ success: boolean }> }

export function isLoopbackHostname(hostname: string | undefined): boolean {
  if (!hostname) return false
  const host = hostname.split('%')[0]?.toLowerCase()
  return host === '127.0.0.1' || host === 'localhost' || host === '::1'
}

export function isLocalAppUrl(appUrl: string | undefined): boolean {
  if (!appUrl) return false
  try {
    return isLoopbackHostname(new URL(appUrl).hostname)
  } catch {
    return false
  }
}

export function requestHostname(request: { url: string }): string | undefined {
  try {
    return new URL(request.url).hostname
  } catch {
    return undefined
  }
}

export function allowUnpaidDevGrant(options: {
  allowDevLogin: string | undefined
  appUrl: string
  stripeSecretKey: string | undefined
  requestHostname?: string
}): boolean {
  return (
    !options.stripeSecretKey &&
    options.allowDevLogin === '1' &&
    isLocalAppUrl(options.appUrl) &&
    isLoopbackHostname(options.requestHostname)
  )
}

export function allowedCorsOrigin(requestOrigin: string | undefined, appUrl: string): string | undefined {
  if (!requestOrigin) return undefined
  try {
    if (new URL(requestOrigin).origin === new URL(appUrl).origin) return requestOrigin
  } catch {
    return undefined
  }
  return undefined
}

export function timingSafeEqualBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false
  let mismatch = 0
  for (let i = 0; i < left.length; i += 1) mismatch |= left[i] ^ right[i]
  return mismatch === 0
}

export function timingSafeEqualString(left: string, right: string): boolean {
  return timingSafeEqualBytes(new TextEncoder().encode(left), new TextEncoder().encode(right))
}

export function hexToBytes(hex: string): Uint8Array | null {
  if (!/^[0-9a-fA-F]*$/.test(hex) || hex.length % 2 !== 0) return null
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

export function bytesToHex(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  return [...view].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function timingSafeEqualHex(left: string, right: string): boolean {
  const leftBytes = hexToBytes(left)
  const rightBytes = hexToBytes(right)
  if (!leftBytes || !rightBytes) return false
  return timingSafeEqualBytes(leftBytes, rightBytes)
}

export function parseCheckoutLicense(value: unknown): CheckoutLicense | null {
  if (value === 'snapshot' || value === 'update_pass' || value === 'upgrade') return value
  return null
}

export function grantedCheckoutLicense(license: CheckoutLicense): 'snapshot' | 'update_pass' {
  return license === 'snapshot' ? 'snapshot' : 'update_pass'
}

export function parseDonateCents(value: unknown, fallback: number): number | null {
  const amount = value === undefined || value === null ? fallback : value
  if (typeof amount !== 'number' || !Number.isInteger(amount)) return null
  if (amount < MIN_DONATE_CENTS || amount > MAX_DONATE_CENTS) return null
  return amount
}

export function isPackVersionLabel(version: string): boolean {
  return PACK_VERSION_RE.test(version) && version.length <= 16
}

export function downloadFilename(slug: string, version: string): string | null {
  if (!isPackVersionLabel(version) || !/^[a-z0-9-]+$/.test(slug)) return null
  return `${slug}-${version.toLowerCase()}.zip`
}

export function audioContentType(extension: string): string {
  return AUDIO_CONTENT_TYPES[extension] ?? 'audio/ogg'
}

export function isLiveDesignatedPreview(options: {
  listingStatus: string
  previewR2Key: string | null
  sortOrder: number
  minSortOrder: number
  isCurrentVersion: boolean
}): boolean {
  return (
    options.listingStatus === 'live' &&
    options.isCurrentVersion &&
    Boolean(options.previewR2Key) &&
    options.sortOrder === options.minSortOrder
  )
}

export type PackWebhookGrant =
  | {
      ok: true
      value: {
        userId: string
        packId: string
        license: 'snapshot' | 'update_pass'
        version: string
        amountCents: number
      }
    }
  | { ok: false; error: string }

export function parsePackWebhookGrant(input: {
  metadata: Record<string, string>
  amountTotal: unknown
  pack: { id: string; priceSnapshotCents: number; priceUpdatePassCents: number; versions: string[] } | null
}): PackWebhookGrant {
  const checkoutLicense = parseCheckoutLicense(input.metadata.checkoutLicense)
  if (input.metadata.type !== 'pack' || !checkoutLicense) return { ok: false, error: 'Unknown checkout license' }
  if (!input.pack) return { ok: false, error: 'Unknown pack' }
  const license = grantedCheckoutLicense(checkoutLicense)
  const userId = input.metadata.userId ?? ''
  const packId = input.metadata.packId ?? ''
  const version = input.metadata.version ?? ''
  const amountCents =
    typeof input.amountTotal === 'number' && Number.isInteger(input.amountTotal) ? input.amountTotal : null
  if (!WEBHOOK_ID_RE.test(userId) || packId !== input.pack.id) return { ok: false, error: 'Invalid pack grant' }
  if (input.metadata.license !== license) return { ok: false, error: 'License mismatch' }
  if (!isPackVersionLabel(version) || !input.pack.versions.includes(version)) {
    return { ok: false, error: 'Unknown pack version' }
  }
  let expected: number
  try {
    expected = licenseUnitAmount({
      license: checkoutLicense,
      snapshotCents: input.pack.priceSnapshotCents,
      updatePassCents: input.pack.priceUpdatePassCents,
    })
  } catch {
    return { ok: false, error: 'Invalid catalog price' }
  }
  if (amountCents !== expected) return { ok: false, error: 'Amount does not match catalog price' }
  return { ok: true, value: { userId, packId, license, version, amountCents } }
}

export function sniffUpload(bytes: Uint8Array): SniffedUpload | null {
  if (bytes.length < 4) return null
  if (bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) return 'ogg'
  if (bytes[0] === 0x66 && bytes[1] === 0x4c && bytes[2] === 0x61 && bytes[3] === 0x43) return 'flac'
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return 'mp3'
  if (bytes[0] === 0xff && bytes.length > 1 && (bytes[1] & 0xe0) === 0xe0) return 'mp3'
  if (
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07) &&
    (bytes[3] === 0x04 || bytes[3] === 0x06 || bytes[3] === 0x08)
  ) {
    return 'zip'
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x41 &&
    bytes[10] === 0x56 &&
    bytes[11] === 0x45
  ) {
    return 'wav'
  }
  return null
}

export function uploadMatchesExtension(kind: SniffedUpload, extension: string): boolean {
  if (kind === 'ogg') return extension === '.ogg' || extension === '.opus'
  if (kind === 'wav') return extension === '.wav'
  if (kind === 'flac') return extension === '.flac'
  if (kind === 'mp3') return extension === '.mp3'
  return extension === '.zip'
}

export function sessionIsActive(options: { expiresAt: number; updatedAt: number; now?: number }): boolean {
  const now = options.now ?? Date.now()
  if (options.expiresAt <= now) return false
  return now - options.updatedAt <= SESSION_IDLE_MS
}

export function parseSignUpInput(input: { email?: string; password?: string; name?: string }):
  | { ok: true; value: { email: string; password: string; name: string } }
  | { ok: false; error: string } {
  const name = input.name?.trim() ?? ''
  const email = input.email?.trim().toLowerCase() ?? ''
  const password = input.password ?? ''
  if (!name || !email || !password) return { ok: false, error: 'Name, email, and password are required' }
  if (name.length > MAX_NAME_LENGTH) return { ok: false, error: 'Name is too long' }
  if (!EMAIL_RE.test(email) || email.length > 254) return { ok: false, error: 'Enter a valid email' }
  if (password.length < MIN_PASSWORD_LENGTH) return { ok: false, error: 'Password must be at least 8 characters' }
  if (password.length > MAX_PASSWORD_LENGTH) return { ok: false, error: 'Password is too long' }
  return { ok: true, value: { email, password, name } }
}

export function clipPassword(password: string): string {
  return password.slice(0, MAX_PASSWORD_LENGTH + 1)
}

export interface GithubEmailRow {
  email: string
  primary: boolean
  verified: boolean
}

export function pickVerifiedGithubEmail(profileEmail: string | undefined, emails: unknown): string | null {
  if (!Array.isArray(emails)) return null
  const verified: GithubEmailRow[] = []
  for (const row of emails) {
    if (!row || typeof row !== 'object') continue
    const record = row as Record<string, unknown>
    if (typeof record.email !== 'string' || record.verified !== true) continue
    verified.push({
      email: record.email,
      primary: record.primary === true,
      verified: true,
    })
  }
  if (profileEmail && verified.some((row) => row.email.toLowerCase() === profileEmail.toLowerCase())) {
    return profileEmail.toLowerCase()
  }
  const primary = verified.find((row) => row.primary)
  return (primary?.email ?? verified[0]?.email ?? null)?.toLowerCase() ?? null
}

/**
 * Catches the deploy that ships the committed loopback `APP_URL` to production. That value
 * silently disables the Secure cookie flag and makes every CORS origin fail, and nothing
 * else in the request path notices, so the worker refuses to serve instead.
 *
 * Configured Stripe keys are the signal that this is a real deployment rather than a
 * local dev run against the checked-in defaults.
 */
export function appUrlConfigError(env: {
  APP_URL?: string
  STRIPE_SECRET_KEY?: string
}): string | null {
  if (!env.APP_URL) return 'APP_URL is not configured'
  let parsed: URL
  try {
    parsed = new URL(env.APP_URL)
  } catch {
    return 'APP_URL is not a valid URL'
  }
  if (!env.STRIPE_SECRET_KEY) return null
  if (isLoopbackHostname(parsed.hostname)) {
    return 'APP_URL points at loopback while Stripe is configured; set it to the public origin'
  }
  if (parsed.protocol !== 'https:') {
    return 'APP_URL must use https in a deployment with Stripe configured'
  }
  return null
}

export function apiSecurityHeaders(appUrl: string): Record<string, string> {
  const headers: Record<string, string> = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  }
  if (appUrl.startsWith('https://')) {
    headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
  }
  return headers
}

export class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>()
  private readonly max: number
  private readonly windowMs: number
  private lastSweep = 0

  constructor(max: number, windowMs: number) {
    this.max = max
    this.windowMs = windowMs
  }

  allow(key: string, now = Date.now()): boolean {
    this.evictExpired(now)
    const recent = (this.hits.get(key) ?? []).filter((at) => now - at < this.windowMs)
    if (recent.length >= this.max) {
      this.hits.set(key, recent)
      return false
    }
    recent.push(now)
    this.hits.set(key, recent)
    return true
  }

  /**
   * Without this the map only ever grows: it is keyed by path + client IP, and a key whose
   * caller never returns is never revisited, so its entry lives as long as the isolate.
   */
  private evictExpired(now: number): void {
    if (now - this.lastSweep < this.windowMs) return
    this.lastSweep = now
    for (const [key, hits] of this.hits) {
      if (hits.every((at) => now - at >= this.windowMs)) this.hits.delete(key)
    }
  }
}

export async function allowRateLimitedRequest(options: {
  binding?: RateLimitBinding
  limiter: SlidingWindowLimiter
  key: string
  now?: number
}): Promise<boolean> {
  if (options.binding) {
    const { success } = await options.binding.limit({ key: options.key })
    if (!success) return false
  }
  return options.limiter.allow(options.key, options.now)
}

export function clientIp(request: Request): string {
  return (
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  )
}
