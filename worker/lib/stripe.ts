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

export function licenseUnitAmount(options: {
  license: 'snapshot' | 'update_pass' | 'upgrade'
  snapshotCents: number
  updatePassCents: number
}): number {
  if (options.license === 'snapshot') return options.snapshotCents
  if (options.license === 'update_pass') return options.updatePassCents
  return options.updatePassCents - options.snapshotCents
}
