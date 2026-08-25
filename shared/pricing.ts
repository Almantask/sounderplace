export function isFreePack(priceSnapshotCents: number, priceUpdatePassCents: number): boolean {
  return priceSnapshotCents === 0 && priceUpdatePassCents === 0
}

export function upgradeDeltaCents(priceSnapshotCents: number, priceUpdatePassCents: number): number {
  if (priceUpdatePassCents < priceSnapshotCents) {
    throw new Error('Update-pass price must be greater than or equal to snapshot price')
  }
  return priceUpdatePassCents - priceSnapshotCents
}

export function formatUsd(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
}

export function checkoutKind(options: {
  priceSnapshotCents: number
  priceUpdatePassCents: number
  alreadyOwnsSnapshot: boolean
  alreadyOwnsUpdatePass: boolean
}): 'free' | 'snapshot' | 'update_pass' | 'upgrade' | 'owned' {
  if (options.alreadyOwnsUpdatePass) return 'owned'
  if (isFreePack(options.priceSnapshotCents, options.priceUpdatePassCents)) return 'free'
  if (options.alreadyOwnsSnapshot) return 'upgrade'
  return 'snapshot'
}
