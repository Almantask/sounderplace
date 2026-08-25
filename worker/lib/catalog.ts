import { canDownloadVersion } from '../../shared/entitlements.ts'
import { rankFeaturedPacks } from '../../shared/featured.ts'
import type { LicenseType } from '../../shared/types.ts'
import { AI_DISCLOSURE, BUYER_LICENSE } from '../../shared/types.ts'
import type { Env } from '../env.ts'
import { ensureSeed } from './seed.ts'

export async function listPacks(env: Env, url: URL) {
  await ensureSeed(env.DB)
  const kind = url.searchParams.get('kind')
  const category = url.searchParams.get('category')
  const mood = url.searchParams.get('mood')
  const instrument = url.searchParams.get('instrument')
  const query = url.searchParams.get('query')?.trim().toLowerCase()

  const packs = await env.DB.prepare(
    `SELECT p.*,
            (SELECT version FROM pack_versions pv WHERE pv.pack_id = p.id ORDER BY published_at DESC LIMIT 1) as current_version,
            (SELECT COUNT(*) FROM tracks t
               JOIN pack_versions pv ON pv.id = t.pack_version_id
              WHERE pv.pack_id = p.id
                AND pv.version = (
                  SELECT version FROM pack_versions pv2
                  WHERE pv2.pack_id = p.id
                  ORDER BY published_at DESC LIMIT 1
                )) as track_count
     FROM packs p
     WHERE listing_status = 'live'`,
  ).all<Record<string, unknown>>()

  const featured = await featuredPackIds(env)
  const tagsByPack = await allPackTags(env)
  const rows = []
  for (const pack of packs.results ?? []) {
    const tags = tagsByPack.get(String(pack.id)) ?? { moods: [], instruments: [] }
    if (kind && kind !== 'all' && pack.kind !== kind) continue
    if (category && pack.category !== category) continue
    if (mood && !tags.moods.includes(mood)) continue
    if (instrument && !tags.instruments.includes(instrument)) continue
    const haystack = `${pack.title} ${pack.category} ${tags.moods.join(' ')} ${tags.instruments.join(' ')}`.toLowerCase()
    if (query && !haystack.includes(query)) continue
    rows.push(serializePack(pack, tags, featured.indexOf(String(pack.id)) >= 0 ? featured.length - featured.indexOf(String(pack.id)) : 0))
  }
  rows.sort((a, b) => b.featuredScore - a.featuredScore || a.title.localeCompare(b.title))
  return rows
}

export async function getPack(env: Env, slug: string) {
  await ensureSeed(env.DB)
  const pack = await env.DB.prepare(`SELECT * FROM packs WHERE slug = ? AND listing_status = 'live'`).bind(slug).first<Record<string, unknown>>()
  if (!pack) return null
  const version = await env.DB.prepare(
    `SELECT * FROM pack_versions WHERE pack_id = ? ORDER BY published_at DESC LIMIT 1`,
  )
    .bind(pack.id)
    .first<Record<string, unknown>>()
  if (!version) return null
  const tracks = await env.DB.prepare(`SELECT * FROM tracks WHERE pack_version_id = ? ORDER BY sort_order`).bind(version.id).all<Record<string, unknown>>()
  const tags = await packTags(env, String(pack.id))
  const featured = await featuredPackIds(env)
  const detail = serializePack(pack, tags, featured.includes(String(pack.id)) ? 1 : 0)
  return {
    ...detail,
    changelog: String(version.changelog),
    aiDisclosure: AI_DISCLOSURE,
    buyerLicense: BUYER_LICENSE,
    tracks: (tracks.results ?? []).map((track) => ({
      id: String(track.id),
      name: String(track.name),
      durationSeconds: Number(track.duration_seconds),
      moods: tags.moods,
      instruments: tags.instruments,
      previewUrl: track.preview_r2_key ? `/api/previews/${track.id}` : null,
    })),
  }
}

async function allPackTags(env: Env) {
  const rows = await env.DB.prepare(
    `SELECT pv.pack_id as packId, tt.kind as kind, tt.value as value
     FROM track_tags tt
     JOIN tracks t ON t.id = tt.track_id
     JOIN pack_versions pv ON pv.id = t.pack_version_id
     GROUP BY pv.pack_id, tt.kind, tt.value`,
  ).all<{ packId: string; kind: string; value: string }>()
  const map = new Map<string, { moods: string[]; instruments: string[] }>()
  for (const row of rows.results ?? []) {
    const current = map.get(row.packId) ?? { moods: [], instruments: [] }
    if (row.kind === 'mood' && !current.moods.includes(row.value)) current.moods.push(row.value)
    if (row.kind === 'instrument' && !current.instruments.includes(row.value)) current.instruments.push(row.value)
    map.set(row.packId, current)
  }
  return map
}

async function packTags(env: Env, packId: string) {
  const rows = await env.DB.prepare(
    `SELECT DISTINCT tt.kind as kind, tt.value as value
     FROM track_tags tt
     JOIN tracks t ON t.id = tt.track_id
     JOIN pack_versions pv ON pv.id = t.pack_version_id
     WHERE pv.pack_id = ?`,
  )
    .bind(packId)
    .all<{ kind: string; value: string }>()
  const moods: string[] = []
  const instruments: string[] = []
  for (const row of rows.results ?? []) {
    if (row.kind === 'mood' && !moods.includes(row.value)) moods.push(row.value)
    if (row.kind === 'instrument' && !instruments.includes(row.value)) instruments.push(row.value)
  }
  return { moods, instruments }
}

function serializePack(
  pack: Record<string, unknown>,
  tags: { moods: string[]; instruments: string[] },
  featuredScore: number,
) {
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
    trackCount: Number(pack.track_count ?? 0) || 30,
    currentVersion: String(pack.current_version ?? 'v1'),
    featuredScore,
    moods: tags.moods,
    instruments: tags.instruments,
  }
}

export async function featuredPackIds(env: Env): Promise<string[]> {
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000
  const packs = await env.DB.prepare(`SELECT id FROM packs WHERE featured_eligible = 1 AND listing_status = 'live'`).all<{ id: string }>()
  const downloads = await env.DB.prepare(
    `SELECT pack_id as packId, user_id as userId, created_at as at FROM download_events WHERE created_at >= ?`,
  )
    .bind(cutoff)
    .all<{ packId: string; userId: string; at: number }>()
  const purchases = await env.DB.prepare(
    `SELECT pack_id as packId, user_id as userId, created_at as at FROM purchases WHERE created_at >= ?`,
  )
    .bind(cutoff)
    .all<{ packId: string; userId: string; at: number }>()
  const activities = [...(downloads.results ?? []), ...(purchases.results ?? [])].map((row) => ({
    packId: row.packId,
    userId: row.userId,
    at: new Date(row.at),
  }))
  return rankFeaturedPacks(
    (packs.results ?? []).map((pack) => ({ id: pack.id, featuredEligible: true })),
    activities,
    new Date(),
    6,
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
  const license = existing.license === 'update_pass' || input.license === 'update_pass' ? 'update_pass' : 'snapshot'
  await env.DB.prepare(`UPDATE entitlements SET license = ?, snapshot_version = ?, updated_at = ? WHERE user_id = ? AND pack_id = ?`)
    .bind(license, existing.snapshot_version, now, input.userId, input.packId)
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
