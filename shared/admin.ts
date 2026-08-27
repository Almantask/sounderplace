import type { ListingStatus, PackKind } from './types.ts'
import { isLocalAppUrl, isLoopbackHostname, timingSafeEqualString } from './security.ts'

export const MIN_LIVE_TRACKS = 30
export const PACK_KINDS = ['ambience', 'fx'] as const
export const LISTING_STATUSES = ['draft', 'pending_review', 'approved', 'rejected', 'live'] as const
export const AUDIO_EXTENSIONS = new Set(['.ogg', '.wav', '.flac', '.mp3', '.opus'])

export interface AdminAccessOptions {
  email: string | null
  emailVerified?: boolean
  adminEmails: string | undefined
  allowDevLogin: string | undefined
  appUrl?: string
  requestHostname?: string
  operatorToken: string | undefined
  presentedToken: string | null
}

export interface PackWrite {
  title: string
  slug: string
  description: string
  kind: PackKind
  category: string
  listingStatus: ListingStatus
  priceSnapshotCents: number
  priceUpdatePassCents: number
  featuredEligible: boolean
  changelog: string
  reviewNotes: string | null
}

export interface TrackWrite {
  name: string
  durationSeconds: number
  moods: string[]
  instruments: string[]
  sortOrder: number | null
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string }

export function parseAdminEmails(value: string | undefined): string[] {
  if (!value) return []
  return value
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
}

export function isAdminAccess(options: AdminAccessOptions): boolean {
  if (
    options.operatorToken &&
    options.presentedToken &&
    timingSafeEqualString(options.operatorToken, options.presentedToken)
  ) {
    return true
  }
  if (!options.email) return false
  const emails = parseAdminEmails(options.adminEmails)
  if (emails.length > 0) {
    if (!options.emailVerified) return false
    return emails.includes(options.email.toLowerCase())
  }
  return options.allowDevLogin === '1' && isLocalAppUrl(options.appUrl) && isLoopbackHostname(options.requestHostname)
}

export function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

export function dollarsToCents(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed === '') return 0
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null
  const amount = Number(trimmed)
  if (!Number.isFinite(amount) || amount < 0) return null
  return Math.round(amount * 100)
}

function asRecord(input: unknown): Record<string, unknown> {
  return input !== null && typeof input === 'object' && !Array.isArray(input) ? (input as Record<string, unknown>) : {}
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function isPackKind(value: string): value is PackKind {
  return (PACK_KINDS as readonly string[]).includes(value)
}

function isListingStatus(value: string): value is ListingStatus {
  return (LISTING_STATUSES as readonly string[]).includes(value)
}

function parseCents(direct: unknown, dollars: unknown): number | null {
  if (typeof direct === 'number' && Number.isFinite(direct) && direct >= 0 && Number.isInteger(direct)) {
    return direct
  }
  if (typeof direct === 'string' && direct.trim() !== '') {
    const parsed = Number(direct)
    if (Number.isInteger(parsed) && parsed >= 0) return parsed
  }
  return dollarsToCents(typeof dollars === 'string' || typeof dollars === 'number' ? String(dollars) : '')
}

function parseTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean)
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }
  return []
}

export function parsePackWrite(
  input: unknown,
  options: { trackCount?: number } = {},
): ParseResult<PackWrite> {
  const body = asRecord(input)
  const title = readString(body.title)
  const description = readString(body.description)
  const kind = readString(body.kind)
  const category = readString(body.category)
  const slugSource = readString(body.slug) || title
  const slug = slugify(slugSource)
  const listingStatusRaw = readString(body.listingStatus) || 'draft'
  const changelog = readString(body.changelog) || 'Initial release'
  const reviewNotes = readString(body.reviewNotes) || null
  const snapshot = parseCents(body.priceSnapshotCents, body.snapshotDollars)
  const updatePass = parseCents(body.priceUpdatePassCents, body.updatePassDollars)
  const featuredEligible = body.featuredEligible !== false && body.featuredEligible !== 'false' && body.featuredEligible !== 0

  if (!title) return { ok: false, error: 'Title is required' }
  if (title.length > 120) return { ok: false, error: 'Title is too long' }
  if (!description) return { ok: false, error: 'Description is required' }
  if (description.length > 2000) return { ok: false, error: 'Description is too long' }
  if (!isPackKind(kind)) return { ok: false, error: 'Kind must be ambience or fx' }
  if (!category) return { ok: false, error: 'Category is required' }
  if (!slug) return { ok: false, error: 'Slug is required' }
  if (!isListingStatus(listingStatusRaw)) return { ok: false, error: 'Choose a valid listing status' }
  if (snapshot === null) return { ok: false, error: 'Snapshot price is invalid' }
  if (updatePass === null) return { ok: false, error: 'Update-pass price is invalid' }
  if (updatePass < snapshot) {
    return { ok: false, error: 'Update-pass price must be greater than or equal to snapshot price' }
  }
  if (listingStatusRaw === 'live' && options.trackCount !== undefined && options.trackCount < MIN_LIVE_TRACKS) {
    return { ok: false, error: `Live packs need at least ${MIN_LIVE_TRACKS} tracks` }
  }

  return {
    ok: true,
    value: {
      title,
      slug,
      description,
      kind,
      category,
      listingStatus: listingStatusRaw,
      priceSnapshotCents: snapshot,
      priceUpdatePassCents: updatePass,
      featuredEligible,
      changelog,
      reviewNotes,
    },
  }
}

export function parseTrackWrite(input: unknown): ParseResult<TrackWrite> {
  const body = asRecord(input)
  const name = readString(body.name)
  const durationSeconds = Number(body.durationSeconds)
  const sortOrder = typeof body.sortOrder === 'number' && Number.isInteger(body.sortOrder) ? body.sortOrder : null

  if (!name) return { ok: false, error: 'Track name is required' }
  if (!Number.isFinite(durationSeconds) || durationSeconds < 1) {
    return { ok: false, error: 'Duration must be at least 1 second' }
  }

  return {
    ok: true,
    value: {
      name,
      durationSeconds: Math.round(durationSeconds),
      moods: parseTags(body.moods),
      instruments: parseTags(body.instruments),
      sortOrder,
    },
  }
}

export function fileExtension(filename: string, fallback = '.ogg'): string {
  const index = filename.lastIndexOf('.')
  if (index < 0) return fallback
  return filename.slice(index).toLowerCase()
}

export function bearerToken(header: string | null): string | null {
  if (!header) return null
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() ?? null
}
