import { describe, expect, it } from 'vitest'
import { licenseUnitAmount } from './stripe.ts'

describe('stripe license amounts', () => {
  it('charges snapshot X, update-pass Y, and upgrade Y minus X', () => {
    expect(licenseUnitAmount({ license: 'snapshot', snapshotCents: 900, updatePassCents: 1400 })).toBe(900)
    expect(licenseUnitAmount({ license: 'update_pass', snapshotCents: 900, updatePassCents: 1400 })).toBe(1400)
    expect(licenseUnitAmount({ license: 'upgrade', snapshotCents: 900, updatePassCents: 1400 })).toBe(500)
  })
})
