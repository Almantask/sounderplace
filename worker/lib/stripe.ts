import { STRIPE_SIGNATURE_TOLERANCE_SEC, bytesToHex, timingSafeEqualHex } from '../../shared/security.ts'
import { licenseUnitAmount } from '../../shared/pricing.ts'

export { licenseUnitAmount }

export async function stripeRequest(
  secretKey: string,
  path: string,
  params: Record<string, string>,
): Promise<Record<string, unknown>> {
  const body = new URLSearchParams(params)
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })
  const json = (await response.json()) as Record<string, unknown>
  if (!response.ok) {
    const err = json.error as { message?: string } | undefined
    throw new Error(err?.message ?? `Stripe error ${response.status}`)
  }
  return json
}

export async function verifyStripeSignature(
  payload: string,
  header: string,
  secret: string,
  nowSec = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  const parts = header.split(',').map((item) => {
    const eq = item.indexOf('=')
    if (eq < 0) return ['', ''] as const
    return [item.slice(0, eq).trim(), item.slice(eq + 1).trim()] as const
  })
  const timestamp = parts.find(([key]) => key === 't')?.[1]
  const signatures = parts.filter(([key]) => key === 'v1').map(([, value]) => value)
  if (!timestamp || signatures.length === 0) return false
  const ts = Number(timestamp)
  if (!Number.isFinite(ts) || Math.abs(nowSec - ts) > STRIPE_SIGNATURE_TOLERANCE_SEC) return false
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signed = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${payload}`))
  const digest = bytesToHex(signed)
  let ok = false
  for (const expected of signatures) {
    if (timingSafeEqualHex(digest, expected)) ok = true
  }
  return ok
}
