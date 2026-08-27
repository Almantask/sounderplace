import { describe, expect, it } from 'vitest'
import { bytesToHex } from '../../shared/security.ts'
import { verifyStripeSignature } from './stripe.ts'

describe('verifyStripeSignature', () => {
  async function sign(secret: string, timestamp: string, payload: string): Promise<string> {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
    const signed = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${payload}`))
    return bytesToHex(signed)
  }

  it('accepts a fresh v1 signature and rejects stale or wrong ones', async () => {
    const payload = '{"type":"checkout.session.completed"}'
    const secret = 'whsec_test'
    const now = 1_700_000_000
    const digest = await sign(secret, String(now), payload)
    expect(await verifyStripeSignature(payload, `t=${now},v1=${digest}`, secret, now)).toBe(true)
    expect(await verifyStripeSignature(payload, `t=${now},v1=deadbeef,v1=${digest}`, secret, now)).toBe(true)
    expect(await verifyStripeSignature(payload, `t=${now},v1=00`, secret, now)).toBe(false)
    expect(await verifyStripeSignature(payload, `t=${now - 301},v1=${digest}`, secret, now)).toBe(false)
  })
})
