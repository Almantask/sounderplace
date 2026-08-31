import type { ListingStatus, PackKind } from './types.ts'

/**
 * Shapes for the demo catalogue generated from a local Thunder FX render library.
 * The data itself lives in `demo-library.generated.ts`; regenerate it with
 * `npm run demo:build -- --dir <library root>`.
 */

export interface DemoTrack {
  id: string
  name: string
  durationSeconds: number
  sortOrder: number
  moods: string[]
  instruments: string[]
  /** R2 key for the full-quality object, or null when it has not been ingested. */
  fullKey: string | null
  /** R2 key for the public preview object, or null when this track is not previewable. */
  previewKey: string | null
}

export interface DemoPack {
  id: string
  slug: string
  title: string
  description: string
  kind: PackKind
  category: string
  listingStatus: ListingStatus
  priceSnapshotCents: number
  priceUpdatePassCents: number
  featuredEligible: boolean
  version: string
  changelog: string
  zipKey: string
  tracks: DemoTrack[]
}
