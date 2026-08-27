export type PackKind = 'ambience' | 'fx'
export type LicenseType = 'snapshot' | 'update_pass'
export type OwnerType = 'platform' | 'user'
export type ListingStatus =
  | 'draft'
  | 'pending_review'
  | 'approved'
  | 'rejected'
  | 'live'

export type TagKind = 'mood' | 'instrument'

export interface PackSummary {
  id: string
  slug: string
  title: string
  description: string
  kind: PackKind
  category: string
  ownerType: OwnerType
  listingStatus: ListingStatus
  priceSnapshotCents: number
  priceUpdatePassCents: number
  trackCount: number
  currentVersion: string
  featuredScore: number
}

export interface TrackSummary {
  id: string
  name: string
  durationSeconds: number
  moods: string[]
  instruments: string[]
  previewUrl: string | null
}

export interface PackDetail extends PackSummary {
  changelog: string
  aiDisclosure: string
  buyerLicense: string
  tracks: TrackSummary[]
}

export interface EntitlementView {
  packId: string
  license: LicenseType
  snapshotVersion: string
}

export interface SessionUser {
  id: string
  email: string
  name: string
  isAdmin?: boolean
}

export interface AdminPackSummary {
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
  trackCount: number
  currentVersion: string
  updatedAt: number
}

export interface AdminTrack {
  id: string
  name: string
  durationSeconds: number
  sortOrder: number
  moods: string[]
  instruments: string[]
  hasFullAudio: boolean
  hasPreviewAudio: boolean
  previewUrl: string | null
}

export interface AdminPackDetail extends AdminPackSummary {
  changelog: string
  reviewNotes: string | null
  tracks: AdminTrack[]
}

export const AI_DISCLOSURE =
  'Generated with Stable Audio 3 (open weights), commercially licensed; prompts and selection are human-reviewed.'

export const BUYER_LICENSE =
  'Royalty-free use in games, streams, videos, and commercial projects. You may not resell or republish the raw library as a competing pack or sample collection.'
