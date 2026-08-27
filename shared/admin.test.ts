import { describe, expect, it } from 'vitest'
import {
  MIN_LIVE_TRACKS,
  dollarsToCents,
  isAdminAccess,
  parseAdminEmails,
  parsePackWrite,
  parseTrackWrite,
  slugify,
} from './admin.ts'

describe('parseAdminEmails', () => {
  it('splits, trims, and lowercases a comma-separated list', () => {
    expect(parseAdminEmails(' Ada@Example.com, other@sunderplace.dev ')).toEqual([
      'ada@example.com',
      'other@sunderplace.dev',
    ])
  })

  it('returns an empty list when unset', () => {
    expect(parseAdminEmails(undefined)).toEqual([])
    expect(parseAdminEmails('')).toEqual([])
  })
})

describe('isAdminAccess', () => {
  it('grants access when the signed-in email is verified and on the allowlist', () => {
    expect(
      isAdminAccess({
        email: 'ada@example.com',
        emailVerified: true,
        adminEmails: 'ada@example.com',
        allowDevLogin: undefined,
        operatorToken: undefined,
        presentedToken: null,
      }),
    ).toBe(true)
  })

  it('denies allowlist access when the email is not verified', () => {
    expect(
      isAdminAccess({
        email: 'ada@example.com',
        emailVerified: false,
        adminEmails: 'ada@example.com',
        allowDevLogin: undefined,
        operatorToken: undefined,
        presentedToken: null,
      }),
    ).toBe(false)
  })

  it('denies access when the email is not on the allowlist', () => {
    expect(
      isAdminAccess({
        email: 'listener@example.com',
        adminEmails: 'ada@example.com',
        allowDevLogin: '1',
        operatorToken: undefined,
        presentedToken: null,
      }),
    ).toBe(false)
  })

  it('grants access to any signed-in user in local dev when no allowlist is set', () => {
    expect(
      isAdminAccess({
        email: 'dev@localhost',
        adminEmails: undefined,
        allowDevLogin: '1',
        appUrl: 'http://127.0.0.1:5173',
        requestHostname: '127.0.0.1',
        operatorToken: undefined,
        presentedToken: null,
      }),
    ).toBe(true)
  })

  it('does not treat ALLOW_DEV_LOGIN as admin access on a public APP_URL', () => {
    expect(
      isAdminAccess({
        email: 'dev@localhost',
        adminEmails: undefined,
        allowDevLogin: '1',
        appUrl: 'https://sunderplace.app',
        requestHostname: '127.0.0.1',
        operatorToken: undefined,
        presentedToken: null,
      }),
    ).toBe(false)
  })

  it('does not treat ALLOW_DEV_LOGIN as admin access when the request host is public', () => {
    expect(
      isAdminAccess({
        email: 'dev@localhost',
        adminEmails: undefined,
        allowDevLogin: '1',
        appUrl: 'http://127.0.0.1:5173',
        requestHostname: 'sunderplace.workers.dev',
        operatorToken: undefined,
        presentedToken: null,
      }),
    ).toBe(false)
  })

  it('grants access when a matching operator token is presented', () => {
    expect(
      isAdminAccess({
        email: null,
        adminEmails: 'ada@example.com',
        allowDevLogin: undefined,
        operatorToken: 'secret-token',
        presentedToken: 'secret-token',
      }),
    ).toBe(true)
  })

  it('denies anonymous users without a matching operator token', () => {
    expect(
      isAdminAccess({
        email: null,
        adminEmails: undefined,
        allowDevLogin: '1',
        operatorToken: 'secret-token',
        presentedToken: 'wrong',
      }),
    ).toBe(false)
  })
})

describe('slugify', () => {
  it('builds a URL slug from a pack title', () => {
    expect(slugify('Tavern Ambience')).toBe('tavern-ambience')
  })

  it('strips punctuation and collapses separators', () => {
    expect(slugify('  Boss!! Hall  ')).toBe('boss-hall')
  })
})

describe('dollarsToCents', () => {
  it('converts dollar strings to integer cents', () => {
    expect(dollarsToCents('9')).toBe(900)
    expect(dollarsToCents('9.00')).toBe(900)
    expect(dollarsToCents('14.5')).toBe(1450)
    expect(dollarsToCents('')).toBe(0)
  })

  it('rejects negative or invalid amounts', () => {
    expect(dollarsToCents('-1')).toBeNull()
    expect(dollarsToCents('nope')).toBeNull()
  })
})

describe('parsePackWrite', () => {
  const valid = {
    title: 'Tavern',
    description: 'Warm inn beds for social scenes.',
    kind: 'ambience',
    category: 'tavern',
  }

  it('accepts a pack and fills slug, draft status, and free prices', () => {
    const result = parsePackWrite(valid)
    expect(result).toEqual({
      ok: true,
      value: {
        title: 'Tavern',
        slug: 'tavern',
        description: 'Warm inn beds for social scenes.',
        kind: 'ambience',
        category: 'tavern',
        listingStatus: 'draft',
        priceSnapshotCents: 0,
        priceUpdatePassCents: 0,
        featuredEligible: true,
        changelog: 'Initial release',
        reviewNotes: null,
      },
    })
  })

  it('keeps an explicit slug and priced update pass', () => {
    const result = parsePackWrite({
      ...valid,
      slug: 'tavern-nights',
      listingStatus: 'live',
      priceSnapshotCents: 900,
      priceUpdatePassCents: 1400,
      featuredEligible: false,
      changelog: 'Remastered lute beds',
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.slug).toBe('tavern-nights')
      expect(result.value.listingStatus).toBe('live')
      expect(result.value.priceSnapshotCents).toBe(900)
      expect(result.value.priceUpdatePassCents).toBe(1400)
      expect(result.value.featuredEligible).toBe(false)
      expect(result.value.changelog).toBe('Remastered lute beds')
    }
  })

  it('converts dollar fields when cents are omitted', () => {
    const result = parsePackWrite({
      ...valid,
      snapshotDollars: '9',
      updatePassDollars: '14',
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.priceSnapshotCents).toBe(900)
      expect(result.value.priceUpdatePassCents).toBe(1400)
    }
  })

  it('rejects a missing title or unknown kind', () => {
    expect(parsePackWrite({ ...valid, title: '' }).ok).toBe(false)
    expect(parsePackWrite({ ...valid, kind: 'music' }).ok).toBe(false)
  })

  it('rejects an update-pass price below the snapshot price', () => {
    const result = parsePackWrite({
      ...valid,
      priceSnapshotCents: 1400,
      priceUpdatePassCents: 900,
    })
    expect(result).toEqual({ ok: false, error: 'Update-pass price must be greater than or equal to snapshot price' })
  })

  it('rejects live listing when there are fewer than the minimum tracks', () => {
    const result = parsePackWrite({ ...valid, listingStatus: 'live' }, { trackCount: 12 })
    expect(result).toEqual({
      ok: false,
      error: `Live packs need at least ${MIN_LIVE_TRACKS} tracks`,
    })
  })
})

describe('parseTrackWrite', () => {
  it('accepts a named track with mood and instrument tags', () => {
    const result = parseTrackWrite({
      name: 'Tavern 01',
      durationSeconds: 90,
      moods: 'lively, warm',
      instruments: ['lute', 'crowd'],
    })
    expect(result).toEqual({
      ok: true,
      value: {
        name: 'Tavern 01',
        durationSeconds: 90,
        moods: ['lively', 'warm'],
        instruments: ['lute', 'crowd'],
        sortOrder: null,
      },
    })
  })

  it('rejects a blank name or non-positive duration', () => {
    expect(parseTrackWrite({ name: '  ', durationSeconds: 90 }).ok).toBe(false)
    expect(parseTrackWrite({ name: 'Tavern 01', durationSeconds: 0 }).ok).toBe(false)
  })
})
