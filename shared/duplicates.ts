export function findExactDuplicate(
  catalogHashes: Iterable<string>,
  incomingSha256: string,
): string | null {
  const needle = incomingSha256.toLowerCase()
  for (const hash of catalogHashes) {
    if (hash.toLowerCase() === needle) return hash
  }
  return null
}

export function shouldAutoRejectDuplicate(options: {
  exactHashHit: boolean
  chromaprintHit: boolean
  clapCosine: number | null
}): 'reject' | 'review' | 'ok' {
  if (options.exactHashHit || options.chromaprintHit) return 'reject'
  if (options.clapCosine !== null && options.clapCosine >= 0.95) return 'review'
  return 'ok'
}
