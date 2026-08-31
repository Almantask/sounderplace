import { canDownloadVersion } from '../../shared/entitlements.ts'
import { rankFeaturedPacks } from '../../shared/featured.ts'
import { isLiveDesignatedPreview } from '../../shared/security.ts'
import type { LicenseType, PackSummary, TrackSummary } from '../../shared/types.ts'
import { AI_DISCLOSURE, BUYER_LICENSE } from '../../shared/types.ts'
import type { Env } from '../env.ts'
import { ensureSeed } from './seed.ts'

const FEATURED_WINDOW_MS = 30 * 24 * 60 * 60 * 1000
const FEATURED_LIMIT = 6

/**
 * Resolves each pack's newest version once, so the columns below can join against it
 * instead of repeating the same correlated subquery for every field they need.
 */
const CURRENT_VERSION_CTE = `
  WITH current_version AS (
    SELECT pv.id AS version_id, pv.pack_id, pv.version, pv.changelog, pv.zip_r2_key
    FROM pack_versions pv
    WHERE pv.published_at = (
      SELECT MAX(pv2.published_at) FROM pack_versions pv2 WHERE pv2.pack_id = pv.pack_id
    )
  ),
  preview_track AS (
    SELECT t.pack_version_id, t.id, t.name, t.duration_seconds, t.preview_r2_key
    FROM tracks t
    WHERE t.sort_order = (
      SELECT MIN(t2.sort_order) FROM tracks t2 WHERE t2.pack_version_id = t.pack_version_id
    )
  )
`

export interface PackFilters {
  kind?: string | null
  category?: string | null
  mood?: string | null
  instrument?: string | null
  query?: string | null
}

export function packFiltersFromUrl(url: URL): PackFilters {
  return {
    kind: url.searchParams.get('kind'),
    category: url.searchParams.get('category'),
    mood: url.searchParams.get('mood'),
    instrument: url.searchParams.get('instrument'),
    query: url.searchParams.get('query'),
  }
}

export async function listPacks(env: Env, filters: PackFilters = {}): Promise<PackSummary[]> {
  await ensureSeed(env.DB)

  const where: string[] = [`p.listing_status = 'live'`]
  const params: unknown[] = []
  if (filters.kind && filters.kind !== 'all') {
    where.push('p.kind = ?')
    params.push(filters.kind)
  }
  if (filters.category) {
    where.push('p.category = ?')
    params.push(filters.category)
  }
  for (const [kind, value] of [
    ['mood', filters.mood],
    ['instrument', filters.instrument],
  ] as const) {
    if (!value) continue
    where.push(`EXISTS (
      SELECT 1 FROM track_tags tt
      JOIN tracks t ON t.id = tt.track_id
      WHERE t.pack_version_id = cv.version_id AND tt.kind = ? AND tt.value = ?
    )`)
    params.push(kind, value)
  }
  const query = filters.query?.trim().toLowerCase()
  if (query) {
    const like = `%${query.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`
    where.push(`(
      LOWER(p.title) LIKE ? ESCAPE '\\' OR LOWER(p.category) LIKE ? ESCAPE '\\'
      OR LOWER(p.description) LIKE ? ESCAPE '\\'
      OR EXISTS (
        SELECT 1 FROM track_tags tt
        JOIN tracks t ON t.id = tt.track_id
        WHERE t.pack_version_id = cv.version_id AND LOWER(tt.value) LIKE ? ESCAPE '\\'
      )
    )`)
    params.push(like, like, like, like)
  }

  const sql = `${CURRENT_VERSION_CTE}
    SELECT p.*, cv.version AS current_version, cv.version_id,
           (SELECT COUNT(*) FROM tracks t WHERE t.pack_version_id = cv.version_id) AS track_count,
           (SELECT COUNT(*) FROM download_events de WHERE de.pack_id = p.id) AS download_count,
           pt.id AS preview_track_id, pt.name AS preview_track_name,
           pt.duration_seconds AS preview_track_duration, pt.preview_r2_key AS preview_r2_key
    FROM packs p
    JOIN current_version cv ON cv.pack_id = p.id
    LEFT JOIN preview_track pt ON pt.pack_version_id = cv.version_id
    WHERE ${where.join(' AND ')}`

  const packs = await env.DB.prepare(sql).bind(...params).all<Record<string, unknown>>()

  const featured = await featuredPackIds(env)
  const tagsByVersion = await tagsForVersions(
    env,
    (packs.results ?? []).map((pack) => String(pack.version_id)),
  )
  const rows = (packs.results ?? []).map((pack) => {
    const rank = featured.indexOf(String(pack.id))
    return serializePack(pack, tagsByVersion.get(String(pack.version_id)) ?? emptyTags(), rank >= 0 ? featured.length - rank : 0)
  })
  rows.sort((a, b) => b.featuredScore - a.featuredScore || a.title.localeCompare(b.title))
  return rows
}

export async function getPack(env: Env, slug: string) {
  await ensureSeed(env.DB)
  const pack = await env.DB.prepare(
    `${CURRENT_VERSION_CTE}
     SELECT p.*, cv.version AS current_version, cv.version_id, cv.changelog,
            (SELECT COUNT(*) FROM tracks t WHERE t.pack_version_id = cv.version_id) AS track_count,
            (SELECT COUNT(*) FROM download_events de WHERE de.pack_id = p.id) AS download_count,
            pt.id AS preview_track_id, pt.name AS preview_track_name,
            pt.duration_seconds AS preview_track_duration, pt.preview_r2_key AS preview_r2_key
     FROM packs p
     JOIN current_version cv ON cv.pack_id = p.id
     LEFT JOIN preview_track pt ON pt.pack_version_id = cv.version_id
     WHERE p.slug = ? AND p.listing_status = 'live'`,
  )
    .bind(slug)
    .first<Record<string, unknown>>()
  if (!pack) return null

  const versionId = String(pack.version_id)
  const trackRows = await env.DB.prepare(
    `SELECT id, name, duration_seconds, sort_order, preview_r2_key
     FROM tracks WHERE pack_version_id = ? ORDER BY sort_order`,
  )
    .bind(versionId)
    .all<{ id: string; name: string; duration_seconds: number; sort_order: number; preview_r2_key: string | null }>()
  const trackList = trackRows.results ?? []
  const tagsByTrack = await tagsForTracks(env, versionId)
  const featured = await featuredPackIds(env)
  const packTags = mergeTags([...tagsByTrack.values()])
  const detail = serializePack(pack, packTags, featured.includes(String(pack.id)) ? 1 : 0)

  const minSortOrder = trackList.reduce((min, track) => Math.min(min, Number(track.sort_order)), Number.POSITIVE_INFINITY)
  const tracks: TrackSummary[] = trackList.map((track) => {
    const tags = tagsByTrack.get(track.id) ?? emptyTags()
    // Exactly one track per live pack is published as a full preview: the lowest sort order,
    // and only when its audio has actually been ingested.
    const previewable = isLiveDesignatedPreview({
      listingStatus: String(pack.listing_status),
      previewR2Key: track.preview_r2_key,
      sortOrder: Number(track.sort_order),
      minSortOrder,
      isCurrentVersion: true,
    })
    return {
      id: track.id,
      name: track.name,
      durationSeconds: Number(track.duration_seconds),
      moods: tags.moods,
      instruments: tags.instruments,
      previewUrl: previewable ? `/api/previews/${track.id}` : null,
    }
  })

  return {
    ...detail,
    changelog: String(pack.changelog ?? ''),
    aiDisclosure: AI_DISCLOSURE,
    buyerLicense: BUYER_LICENSE,
    tracks,
  }
}

function emptyTags() {
  return { moods: [] as string[], instruments: [] as string[] }
}

function mergeTags(groups: Array<{ moods: string[]; instruments: string[] }>) {
  const moods = new Set<string>()
  const instruments = new Set<string>()
  for (const group of groups) {
    for (const mood of group.moods) moods.add(mood)
    for (const instrument of group.instruments) instruments.add(instrument)
  }
  return { moods: [...moods], instruments: [...instruments] }
}

/** Tags grouped per track, for the pack detail view. */
async function tagsForTracks(env: Env, versionId: string) {
  const rows = await env.DB.prepare(
    `SELECT tt.track_id AS trackId, tt.kind AS kind, tt.value AS value
     FROM track_tags tt
     JOIN tracks t ON t.id = tt.track_id
     WHERE t.pack_version_id = ?`,
  )
    .bind(versionId)
    .all<{ trackId: string; kind: string; value: string }>()
  const byTrack = new Map<string, { moods: string[]; instruments: string[] }>()
  for (const row of rows.results ?? []) {
    const current = byTrack.get(row.trackId) ?? emptyTags()
    if (row.kind === 'mood' && !current.moods.includes(row.value)) current.moods.push(row.value)
    if (row.kind === 'instrument' && !current.instruments.includes(row.value)) current.instruments.push(row.value)
    byTrack.set(row.trackId, current)
  }
  return byTrack
}

/** Distinct tags per pack version, for catalogue cards. */
async function tagsForVersions(env: Env, versionIds: string[]) {
  const byVersion = new Map<string, { moods: string[]; instruments: string[] }>()
  if (versionIds.length === 0) return byVersion
  const placeholders = versionIds.map(() => '?').join(', ')
  const rows = await env.DB.prepare(
    `SELECT DISTINCT t.pack_version_id AS versionId, tt.kind AS kind, tt.value AS value
     FROM track_tags tt
     JOIN tracks t ON t.id = tt.track_id
     WHERE t.pack_version_id IN (${placeholders})`,
  )
    .bind(...versionIds)
    .all<{ versionId: string; kind: string; value: string }>()
  for (const row of rows.results ?? []) {
    const current = byVersion.get(row.versionId) ?? emptyTags()
    if (row.kind === 'mood' && !current.moods.includes(row.value)) current.moods.push(row.value)
    if (row.kind === 'instrument' && !current.instruments.includes(row.value)) current.instruments.push(row.value)
    byVersion.set(row.versionId, current)
  }
  return byVersion
}

function serializePack(
  pack: Record<string, unknown>,
  tags: { moods: string[]; instruments: string[] },
  featuredScore: number,
): PackSummary & { moods: string[]; instruments: string[] } {
  // A pack with no ingested preview audio has no preview to offer. Reporting one anyway
  // renders a play button that 404s, so the field stays null and the UI says so.
  const previewTrackId = pack.preview_track_id ? String(pack.preview_track_id) : null
  const hasPreviewAudio = Boolean(pack.preview_r2_key)

  return {
    id: String(pack.id),
    slug: String(pack.slug),
    title: String(pack.title),
    description: String(pack.description),
    kind: pack.kind as 'ambience' | 'fx',
    category: String(pack.category),
    ownerType: pack.owner_type as 'platform' | 'user',
    listingStatus: pack.listing_status as 'live',
    priceSnapshotCents: Number(pack.price_snapshot_cents),
    priceUpdatePassCents: Number(pack.price_update_pass_cents),
    trackCount: Number(pack.track_count ?? 0),
    currentVersion: String(pack.current_version ?? 'v1'),
    featuredScore,
    downloadCount: Number(pack.download_count ?? 0),
    moods: tags.moods,
    instruments: tags.instruments,
    previewTrack:
      previewTrackId && hasPreviewAudio
        ? {
            id: previewTrackId,
            name: String(pack.preview_track_name ?? ''),
            durationSeconds: Number(pack.preview_track_duration ?? 0),
            previewUrl: `/api/previews/${previewTrackId}`,
          }
        : null,
  }
}

export async function featuredPackIds(env: Env): Promise<string[]> {
  const cutoff = Date.now() - FEATURED_WINDOW_MS
  const packs = await env.DB.prepare(
    `SELECT id FROM packs WHERE featured_eligible = 1 AND listing_status = 'live'`,
  ).all<{ id: string }>()
  if ((packs.results ?? []).length === 0) return []

  // One distinct-user-per-pack-per-day roll-up rather than pulling every raw event into
  // the worker; rankFeaturedPacks only ever looks at that granularity.
  const activity = await env.DB.prepare(
    `SELECT pack_id AS packId, user_id AS userId, MIN(created_at) AS at FROM (
       SELECT pack_id, user_id, created_at FROM download_events WHERE created_at >= ?1
       UNION ALL
       SELECT pack_id, user_id, created_at FROM purchases WHERE created_at >= ?1
     )
     GROUP BY pack_id, user_id, created_at / 86400000`,
  )
    .bind(cutoff)
    .all<{ packId: string; userId: string; at: number }>()

  return rankFeaturedPacks(
    (packs.results ?? []).map((pack) => ({ id: pack.id, featuredEligible: true })),
    (activity.results ?? []).map((row) => ({ packId: row.packId, userId: row.userId, at: new Date(row.at) })),
    new Date(),
    FEATURED_LIMIT,
  )
}

export async function getEntitlement(env: Env, userId: string, packId: string) {
  return env.DB.prepare(`SELECT * FROM entitlements WHERE user_id = ? AND pack_id = ?`)
    .bind(userId, packId)
    .first<{ license: LicenseType; snapshot_version: string }>()
}

export async function grantEntitlement(
  env: Env,
  input: { userId: string; packId: string; license: LicenseType; version: string },
) {
  const existing = await getEntitlement(env, input.userId, input.packId)
  const now = Date.now()
  if (!existing) {
    await env.DB.prepare(
      `INSERT INTO entitlements (id, user_id, pack_id, license, snapshot_version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(crypto.randomUUID(), input.userId, input.packId, input.license, input.version, now, now)
      .run()
    return
  }
  // `input.version` is deliberately dropped here: a snapshot buyer keeps the version they
  // paid for, and an update pass covers every version regardless of what is recorded.
  const license = existing.license === 'update_pass' || input.license === 'update_pass' ? 'update_pass' : 'snapshot'
  await env.DB.prepare(
    `UPDATE entitlements SET license = ?, updated_at = ? WHERE user_id = ? AND pack_id = ?`,
  )
    .bind(license, now, input.userId, input.packId)
    .run()
}

export async function recordDownload(env: Env, userId: string, packId: string, version: string) {
  const hourAgo = Date.now() - 60 * 60 * 1000
  const recent = await env.DB.prepare(
    `SELECT id FROM download_events WHERE user_id = ? AND pack_id = ? AND created_at >= ? LIMIT 1`,
  )
    .bind(userId, packId, hourAgo)
    .first()
  if (recent) return
  await env.DB.prepare(
    `INSERT INTO download_events (id, user_id, pack_id, version, created_at) VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(crypto.randomUUID(), userId, packId, version, Date.now())
    .run()
}

export function entitledToVersion(
  entitlement: { license: LicenseType; snapshot_version: string } | null,
  packId: string,
  version: string,
  packIsFree: boolean,
): boolean {
  if (packIsFree) return true
  if (!entitlement) return false
  return canDownloadVersion(
    { packId, license: entitlement.license, snapshotVersion: entitlement.snapshot_version },
    packId,
    version,
  )
}
