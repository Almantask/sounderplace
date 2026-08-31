import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  allowRateLimitedRequest,
  allowUnpaidDevGrant,
  allowedCorsOrigin,
  apiSecurityHeaders,
  audioContentType,
  clipPassword,
  downloadFilename,
  appUrlConfigError,
  isLiveDesignatedPreview,
  isLocalAppUrl,
  isLoopbackHostname,
  isPackVersionLabel,
  parseCheckoutLicense,
  parseDonateCents,
  parsePackWebhookGrant,
  parseSignUpInput,
  pickVerifiedGithubEmail,
  sessionIsActive,
  SESSION_IDLE_MS,
  SESSION_MAX_AGE_MS,
  SlidingWindowLimiter,
  sniffUpload,
  uploadMatchesExtension,
  timingSafeEqualHex,
  timingSafeEqualString,
} from './security.ts'

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

describe('deployed wrangler vars', () => {
  it('does not ship SESSION_SECRET or ALLOW_DEV_LOGIN in wrangler.toml', () => {
    const wrangler = readFileSync(path.join(repoRoot, 'wrangler.toml'), 'utf8')
    expect(wrangler).not.toMatch(/SESSION_SECRET\s*=/)
    expect(wrangler).not.toMatch(/ALLOW_DEV_LOGIN\s*=/)
  })

  it('declares Cloudflare rate-limit bindings for auth and checkout actions', () => {
    const wrangler = readFileSync(path.join(repoRoot, 'wrangler.toml'), 'utf8')
    expect(wrangler).toMatch(/\[\[ratelimits\]\]/)
    expect(wrangler).toMatch(/name = "AUTH_RATE_LIMITER"/)
    expect(wrangler).toMatch(/name = "ACTION_RATE_LIMITER"/)
  })

  it('ships SPA frame and content-type headers for static hosting', () => {
    const headers = readFileSync(path.join(repoRoot, 'public/_headers'), 'utf8')
    expect(headers).toMatch(/X-Frame-Options:\s*DENY/)
    expect(headers).toMatch(/X-Content-Type-Options:\s*nosniff/)
    expect(headers).toMatch(/Content-Security-Policy:/)
  })
})

describe('isLocalAppUrl', () => {
  it('accepts loopback hosts only', () => {
    expect(isLocalAppUrl('http://127.0.0.1:5173')).toBe(true)
    expect(isLocalAppUrl('http://localhost:5173')).toBe(true)
    expect(isLocalAppUrl('https://sunderplace.app')).toBe(false)
    expect(isLocalAppUrl(undefined)).toBe(false)
    expect(isLocalAppUrl('not-a-url')).toBe(false)
    expect(isLoopbackHostname('127.0.0.1')).toBe(true)
    expect(isLoopbackHostname('sunderplace.workers.dev')).toBe(false)
    expect(isLoopbackHostname(undefined)).toBe(false)
  })
})

describe('allowUnpaidDevGrant', () => {
  it('grants only when Stripe is unset, the dev flag is on, and both APP_URL and the request host are local', () => {
    expect(
      allowUnpaidDevGrant({
        allowDevLogin: '1',
        appUrl: 'http://127.0.0.1:5173',
        stripeSecretKey: undefined,
        requestHostname: '127.0.0.1',
      }),
    ).toBe(true)
    expect(
      allowUnpaidDevGrant({
        allowDevLogin: '1',
        appUrl: 'http://127.0.0.1:5173',
        stripeSecretKey: undefined,
        requestHostname: 'sunderplace.workers.dev',
      }),
    ).toBe(false)
    expect(
      allowUnpaidDevGrant({
        allowDevLogin: '1',
        appUrl: 'http://127.0.0.1:5173',
        stripeSecretKey: undefined,
      }),
    ).toBe(false)
    expect(
      allowUnpaidDevGrant({
        allowDevLogin: '1',
        appUrl: 'https://sunderplace.app',
        stripeSecretKey: undefined,
        requestHostname: '127.0.0.1',
      }),
    ).toBe(false)
    expect(
      allowUnpaidDevGrant({
        allowDevLogin: '1',
        appUrl: 'http://127.0.0.1:5173',
        stripeSecretKey: 'sk_test_x',
        requestHostname: '127.0.0.1',
      }),
    ).toBe(false)
    expect(
      allowUnpaidDevGrant({
        allowDevLogin: undefined,
        appUrl: 'http://127.0.0.1:5173',
        stripeSecretKey: undefined,
        requestHostname: '127.0.0.1',
      }),
    ).toBe(false)
  })
})

describe('parseCheckoutLicense', () => {
  it('accepts only snapshot, update_pass, and upgrade', () => {
    expect(parseCheckoutLicense('snapshot')).toBe('snapshot')
    expect(parseCheckoutLicense('update_pass')).toBe('update_pass')
    expect(parseCheckoutLicense('upgrade')).toBe('upgrade')
    expect(parseCheckoutLicense('not-upgrade')).toBeNull()
    expect(parseCheckoutLicense('')).toBeNull()
    expect(parseCheckoutLicense(undefined)).toBeNull()
  })
})

describe('parseDonateCents', () => {
  it('requires a finite integer in the allowed range', () => {
    expect(parseDonateCents(500, 500)).toBe(500)
    expect(parseDonateCents(undefined, 500)).toBe(500)
    expect(parseDonateCents(99, 500)).toBeNull()
    expect(parseDonateCents(50_001, 500)).toBeNull()
    expect(parseDonateCents(10.5, 500)).toBeNull()
    expect(parseDonateCents('500', 500)).toBeNull()
  })
})

describe('parseSignUpInput', () => {
  it('accepts a valid name, email, and password', () => {
    expect(parseSignUpInput({ name: ' Ada ', email: 'Ada@Example.com', password: 'correct horse' })).toEqual({
      ok: true,
      value: { name: 'Ada', email: 'ada@example.com', password: 'correct horse' },
    })
  })

  it('rejects missing fields, invalid email, and short or long passwords', () => {
    expect(parseSignUpInput({ name: 'Ada', email: 'ada@example.com' }).ok).toBe(false)
    expect(parseSignUpInput({ name: 'Ada', email: 'not-email', password: 'correct horse' }).ok).toBe(false)
    expect(parseSignUpInput({ name: 'Ada', email: 'ada@example.com', password: 'short' }).ok).toBe(false)
    expect(parseSignUpInput({ name: 'Ada', email: 'ada@example.com', password: 'x'.repeat(129) }).ok).toBe(false)
  })
})

describe('pickVerifiedGithubEmail', () => {
  it('uses only verified GitHub emails and ignores unverified fallbacks', () => {
    expect(
      pickVerifiedGithubEmail('public@example.com', [
        { email: 'unverified@example.com', primary: true, verified: false },
        { email: 'real@example.com', primary: false, verified: true },
      ]),
    ).toBe('real@example.com')
    expect(pickVerifiedGithubEmail('stolen@example.com', [{ email: 'stolen@example.com', primary: true, verified: false }])).toBeNull()
    expect(pickVerifiedGithubEmail('anyone@example.com', { message: 'Bad credentials' })).toBeNull()
  })

  it('prefers a profile email when that address is verified', () => {
    expect(
      pickVerifiedGithubEmail('Ada@Example.com', [
        { email: 'other@example.com', primary: true, verified: true },
        { email: 'ada@example.com', primary: false, verified: true },
      ]),
    ).toBe('ada@example.com')
  })
})

describe('preview and download guards', () => {
  it('serves a preview only for the current live pack designated track', () => {
    expect(
      isLiveDesignatedPreview({
        listingStatus: 'live',
        previewR2Key: 'packs/tavern/v/v1/tracks/t1.ogg',
        sortOrder: 0,
        minSortOrder: 0,
        isCurrentVersion: true,
      }),
    ).toBe(true)
    expect(
      isLiveDesignatedPreview({
        listingStatus: 'draft',
        previewR2Key: 'packs/tavern/v/v1/tracks/t1.ogg',
        sortOrder: 0,
        minSortOrder: 0,
        isCurrentVersion: true,
      }),
    ).toBe(false)
    expect(
      isLiveDesignatedPreview({
        listingStatus: 'live',
        previewR2Key: 'packs/tavern/v/v1/tracks/t2.ogg',
        sortOrder: 1,
        minSortOrder: 0,
        isCurrentVersion: true,
      }),
    ).toBe(false)
  })

  it('builds a download filename only for safe slug and version labels', () => {
    expect(isPackVersionLabel('v1')).toBe(true)
    expect(isPackVersionLabel('v12')).toBe(true)
    expect(isPackVersionLabel('v1"; filename="x')).toBe(false)
    expect(downloadFilename('tavern-ambience', 'v1')).toBe('tavern-ambience-v1.zip')
    expect(downloadFilename('tavern-ambience', 'v1.zip\r\n')).toBeNull()
  })
})

describe('cors, headers, and crypto helpers', () => {
  it('reflects only the configured app origin', () => {
    expect(allowedCorsOrigin('https://sunderplace.app', 'https://sunderplace.app')).toBe('https://sunderplace.app')
    expect(allowedCorsOrigin('https://evil.example', 'https://sunderplace.app')).toBeUndefined()
    expect(allowedCorsOrigin(undefined, 'https://sunderplace.app')).toBeUndefined()
  })

  it('sets API security headers and HSTS on https app urls', () => {
    const http = apiSecurityHeaders('http://127.0.0.1:5173')
    expect(http['X-Content-Type-Options']).toBe('nosniff')
    expect(http['X-Frame-Options']).toBe('DENY')
    expect(http['Strict-Transport-Security']).toBeUndefined()
    expect(apiSecurityHeaders('https://sunderplace.app')['Strict-Transport-Security']).toMatch(/max-age=/)
  })

  it('compares secrets without returning true on length mismatch', () => {
    expect(timingSafeEqualString('secret-token', 'secret-token')).toBe(true)
    expect(timingSafeEqualString('secret-token', 'wrong-tokenx')).toBe(false)
    expect(timingSafeEqualHex('00ff', '00ff')).toBe(true)
    expect(timingSafeEqualHex('00ff', '00fe')).toBe(false)
  })

  it('maps audio extensions to server-controlled content types', () => {
    expect(audioContentType('.mp3')).toBe('audio/mpeg')
    expect(audioContentType('.ogg')).toBe('audio/ogg')
    expect(clipPassword('x'.repeat(200)).length).toBe(129)
  })
})

describe('SlidingWindowLimiter', () => {
  it('rejects a key after the max hits in the window', () => {
    const limiter = new SlidingWindowLimiter(2, 1_000)
    expect(limiter.allow('auth:1', 0)).toBe(true)
    expect(limiter.allow('auth:1', 1)).toBe(true)
    expect(limiter.allow('auth:1', 2)).toBe(false)
    expect(limiter.allow('auth:2', 2)).toBe(true)
    expect(limiter.allow('auth:1', 1_002)).toBe(true)
  })
})

describe('allowRateLimitedRequest', () => {
  it('denies when the Cloudflare binding rejects even if the isolate limiter would allow', async () => {
    const limiter = new SlidingWindowLimiter(10, 1_000)
    const denied = await allowRateLimitedRequest({
      binding: { limit: async () => ({ success: false }) },
      limiter,
      key: 'auth:1',
    })
    expect(denied).toBe(false)
  })

  it('falls back to the isolate limiter when no binding is configured', async () => {
    const limiter = new SlidingWindowLimiter(1, 1_000)
    expect(await allowRateLimitedRequest({ limiter, key: 'auth:1', now: 0 })).toBe(true)
    expect(await allowRateLimitedRequest({ limiter, key: 'auth:1', now: 1 })).toBe(false)
  })
})

describe('parsePackWebhookGrant', () => {
  const pack = {
    id: 'pack_boss-ambience',
    priceSnapshotCents: 900,
    priceUpdatePassCents: 1400,
    versions: ['v1'],
  }

  it('accepts a snapshot grant whose amount matches the catalog price', () => {
    expect(
      parsePackWebhookGrant({
        metadata: {
          type: 'pack',
          userId: '11111111-1111-1111-1111-111111111111',
          packId: 'pack_boss-ambience',
          checkoutLicense: 'snapshot',
          license: 'snapshot',
          version: 'v1',
        },
        amountTotal: 900,
        pack,
      }),
    ).toEqual({
      ok: true,
      value: {
        userId: '11111111-1111-1111-1111-111111111111',
        packId: 'pack_boss-ambience',
        license: 'snapshot',
        version: 'v1',
        amountCents: 900,
      },
    })
  })

  it('accepts an upgrade grant at the catalog delta, not the update-pass list price', () => {
    const result = parsePackWebhookGrant({
      metadata: {
        type: 'pack',
        userId: '11111111-1111-1111-1111-111111111111',
        packId: 'pack_boss-ambience',
        checkoutLicense: 'upgrade',
        license: 'update_pass',
        version: 'v1',
      },
      amountTotal: 500,
      pack,
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.license).toBe('update_pass')
  })

  it('rejects unknown licenses, amount mismatches, missing packs, and unknown versions', () => {
    expect(
      parsePackWebhookGrant({
        metadata: {
          type: 'pack',
          userId: '11111111-1111-1111-1111-111111111111',
          packId: 'pack_boss-ambience',
          checkoutLicense: 'not-a-license',
          license: 'update_pass',
          version: 'v1',
        },
        amountTotal: 500,
        pack,
      }).ok,
    ).toBe(false)
    expect(
      parsePackWebhookGrant({
        metadata: {
          type: 'pack',
          userId: '11111111-1111-1111-1111-111111111111',
          packId: 'pack_boss-ambience',
          checkoutLicense: 'snapshot',
          license: 'snapshot',
          version: 'v1',
        },
        amountTotal: 1,
        pack,
      }).ok,
    ).toBe(false)
    expect(
      parsePackWebhookGrant({
        metadata: {
          type: 'pack',
          userId: '11111111-1111-1111-1111-111111111111',
          packId: 'pack_boss-ambience',
          checkoutLicense: 'snapshot',
          license: 'snapshot',
          version: 'v1',
        },
        amountTotal: 900,
        pack: null,
      }).ok,
    ).toBe(false)
    expect(
      parsePackWebhookGrant({
        metadata: {
          type: 'pack',
          userId: '11111111-1111-1111-1111-111111111111',
          packId: 'pack_boss-ambience',
          checkoutLicense: 'snapshot',
          license: 'snapshot',
          version: 'v9',
        },
        amountTotal: 900,
        pack,
      }).ok,
    ).toBe(false)
  })
})

describe('upload sniffing', () => {
  it('detects audio and zip magic bytes and requires a matching extension', () => {
    const ogg = new Uint8Array([0x4f, 0x67, 0x67, 0x53, 0, 0, 0, 0, 0, 0, 0, 0])
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0, 0, 0, 0, 0])
    const riff = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45])
    expect(sniffUpload(ogg)).toBe('ogg')
    expect(sniffUpload(zip)).toBe('zip')
    expect(sniffUpload(riff)).toBe('wav')
    expect(sniffUpload(new Uint8Array([0, 1, 2, 3]))).toBeNull()
    expect(uploadMatchesExtension('ogg', '.ogg')).toBe(true)
    expect(uploadMatchesExtension('ogg', '.opus')).toBe(true)
    expect(uploadMatchesExtension('ogg', '.mp3')).toBe(false)
    expect(uploadMatchesExtension('zip', '.zip')).toBe(true)
    expect(uploadMatchesExtension('wav', '.ogg')).toBe(false)
  })
})

describe('session lifetime', () => {
  it('expires sessions after the idle window even if the absolute expiry is later', () => {
    const created = 1_000_000
    expect(sessionIsActive({ expiresAt: created + SESSION_MAX_AGE_MS, updatedAt: created, now: created + 1_000 })).toBe(
      true,
    )
    expect(
      sessionIsActive({
        expiresAt: created + SESSION_MAX_AGE_MS,
        updatedAt: created,
        now: created + SESSION_IDLE_MS + 1,
      }),
    ).toBe(false)
    expect(sessionIsActive({ expiresAt: created + 10, updatedAt: created, now: created + 11 })).toBe(false)
    expect(SESSION_MAX_AGE_MS).toBe(7 * 24 * 60 * 60 * 1000)
    expect(SESSION_IDLE_MS).toBe(24 * 60 * 60 * 1000)
  })
})

describe('appUrlConfigError', () => {
  it('accepts the loopback default while Stripe is unset', () => {
    expect(appUrlConfigError({ APP_URL: 'http://127.0.0.1:5173' })).toBeNull()
  })

  it('rejects the committed loopback default once Stripe is configured', () => {
    expect(appUrlConfigError({ APP_URL: 'http://127.0.0.1:5173', STRIPE_SECRET_KEY: 'sk_live_x' })).toMatch(/loopback/)
  })

  it('requires https for a real deployment', () => {
    expect(appUrlConfigError({ APP_URL: 'http://sunderplace.test', STRIPE_SECRET_KEY: 'sk_live_x' })).toMatch(/https/)
  })

  it('accepts a public https origin with Stripe configured', () => {
    expect(appUrlConfigError({ APP_URL: 'https://sunderplace.test', STRIPE_SECRET_KEY: 'sk_live_x' })).toBeNull()
  })

  it('rejects a missing or unparseable APP_URL', () => {
    expect(appUrlConfigError({})).toMatch(/not configured/)
    expect(appUrlConfigError({ APP_URL: 'not a url' })).toMatch(/valid URL/)
  })
})
