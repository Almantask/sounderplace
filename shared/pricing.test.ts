import { describe, expect, it } from 'vitest'
import { checkoutKind, formatUsd, isFreePack, licenseUnitAmount, upgradeDeltaCents } from './pricing.ts'

describe('pricing', () => {
  it('treats zero snapshot and update-pass prices as free', () => {
    expect(isFreePack(0, 0)).toBe(true)
    expect(isFreePack(900, 0)).toBe(false)
    expect(isFreePack(0, 1200)).toBe(false)
  })

  it('computes the snapshot-to-update-pass upgrade as Y minus X', () => {
    expect(upgradeDeltaCents(900, 1400)).toBe(500)
    expect(upgradeDeltaCents(0, 0)).toBe(0)
  })

  it('prices snapshot, update-pass, and upgrade from catalog cents', () => {
    expect(licenseUnitAmount({ license: 'snapshot', snapshotCents: 900, updatePassCents: 1400 })).toBe(900)
    expect(licenseUnitAmount({ license: 'update_pass', snapshotCents: 900, updatePassCents: 1400 })).toBe(1400)
    expect(licenseUnitAmount({ license: 'upgrade', snapshotCents: 900, updatePassCents: 1400 })).toBe(500)
  })

  it('rejects an update-pass cheaper than the snapshot', () => {
    expect(() => upgradeDeltaCents(1400, 900)).toThrow(/greater than or equal/)
  })

  it('formats cents as USD', () => {
    expect(formatUsd(0)).toBe('$0.00')
    expect(formatUsd(1400)).toBe('$14.00')
  })

  it('picks checkout kind from ownership and price', () => {
    expect(
      checkoutKind({
        priceSnapshotCents: 0,
        priceUpdatePassCents: 0,
        alreadyOwnsSnapshot: false,
        alreadyOwnsUpdatePass: false,
      }),
    ).toBe('free')
    expect(
      checkoutKind({
        priceSnapshotCents: 900,
        priceUpdatePassCents: 1400,
        alreadyOwnsSnapshot: false,
        alreadyOwnsUpdatePass: false,
      }),
    ).toBe('snapshot')
    expect(
      checkoutKind({
        priceSnapshotCents: 900,
        priceUpdatePassCents: 1400,
        alreadyOwnsSnapshot: true,
        alreadyOwnsUpdatePass: false,
      }),
    ).toBe('upgrade')
    expect(
      checkoutKind({
        priceSnapshotCents: 900,
        priceUpdatePassCents: 1400,
        alreadyOwnsSnapshot: true,
        alreadyOwnsUpdatePass: true,
      }),
    ).toBe('owned')
  })
})
