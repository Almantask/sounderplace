function safeCount(count: number): number {
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0
}

export function formatDownloadCount(count: number): string {
  return new Intl.NumberFormat('en-US').format(safeCount(count))
}

/**
 * Counts distinct download sessions, not files: recordDownload collapses repeat pulls of
 * the same pack by the same user within an hour.
 */
export function downloadCountLabel(count: number): string {
  const safe = safeCount(count)
  if (safe === 0) return 'No downloads yet'
  return `${formatDownloadCount(safe)} ${safe === 1 ? 'download' : 'downloads'}`
}
