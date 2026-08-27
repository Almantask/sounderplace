import { findExactDuplicate, shouldAutoRejectDuplicate } from '../../shared/duplicates.ts'
import {
  AUDIO_EXTENSIONS,
  bearerToken,
  fileExtension,
  isAdminAccess,
  parsePackWrite,
  parseTrackWrite,
} from '../../shared/admin.ts'
import { audioContentType, MAX_AUDIO_UPLOAD_BYTES, MAX_ZIP_UPLOAD_BYTES, requestHostname, sniffUpload, uploadMatchesExtension } from '../../shared/security.ts'
import type { AdminPackDetail, AdminPackSummary, AdminTrack, ListingStatus, PackKind, SessionUser } from '../../shared/types.ts'
import type { AuthUser } from '../auth.ts'
import type { Env } from '../env.ts'
import { ensureSeed } from './seed.ts'

type AdminGate = { ok: true } | { ok: false; status: 401 | 403; error: string }

const PACK_COUNT_SQL = `(SELECT COUNT(*) FROM tracks t
   JOIN pack_versions pv ON pv.id = t.pack_version_id
  WHERE pv.pack_id = p.id
    AND pv.version = (
      SELECT version FROM pack_versions pv2
      WHERE pv2.pack_id = p.id
      ORDER BY published_at DESC LIMIT 1
    ))`

export function adminGate(user: AuthUser | null, env: Env, request: Request): AdminGate {
  const presentedToken = bearerToken(request.headers.get('Authorization'))
  if (
    isAdminAccess({
      email: user?.email ?? null,
      emailVerified: user?.emailVerified ?? false,
      adminEmails: env.ADMIN_EMAILS,
      allowDevLogin: env.ALLOW_DEV_LOGIN,
      appUrl: env.APP_URL,
      requestHostname: requestHostname(request),
      operatorToken: env.OPERATOR_TOKEN,
      presentedToken,
    })
  ) {
    return { ok: true }
  }
  if (!user && !presentedToken) return { ok: false, status: 401, error: 'Sign in required' }
  return { ok: false, status: 403, error: 'Admin access required' }
}

export function sessionUser(user: AuthUser, env: Env, request: Request): SessionUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    isAdmin: isAdminAccess({
      email: user.email,
      emailVerified: user.emailVerified,
      adminEmails: env.ADMIN_EMAILS,
      allowDevLogin: env.ALLOW_DEV_LOGIN,
      appUrl: env.APP_URL,
      requestHostname: requestHostname(request),
      operatorToken: env.OPERATOR_TOKEN,
      presentedToken: null,
    }),
  }
}

function serializeSummary(row: Record<string, unknown>): AdminPackSummary {
  return {
    id: String(row.id),
    slug: String(row.slug),
    title: String(row.title),
    description: String(row.description),
    kind: row.kind as PackKind,
    category: String(row.category),
    listingStatus: row.listing_status as ListingStatus,
    priceSnapshotCents: Number(row.price_snapshot_cents),
    priceUpdatePassCents: Number(row.price_update_pass_cents),
    featuredEligible: Boolean(row.featured_eligible),
    trackCount: Number(row.track_count ?? 0),
    currentVersion: String(row.current_version ?? 'v1'),
    updatedAt: Number(row.updated_at ?? 0),
  }
}

async function currentVersion(env: Env, packId: string) {
  return env.DB.prepare(`SELECT * FROM pack_versions WHERE pack_id = ? ORDER BY published_at DESC LIMIT 1`)
    .bind(packId)
    .first<Record<string, unknown>>()
}

async function replaceTrackTags(env: Env, trackId: string, moods: string[], instruments: string[]) {
  await env.DB.prepare(`DELETE FROM track_tags WHERE track_id = ?`).bind(trackId).run()
  for (const mood of moods) {
    await env.DB.prepare(`INSERT INTO track_tags (id, track_id, kind, value) VALUES (?, ?, 'mood', ?)`)
      .bind(crypto.randomUUID(), trackId, mood)
      .run()
  }
  for (const instrument of instruments) {
    await env.DB.prepare(`INSERT INTO track_tags (id, track_id, kind, value) VALUES (?, ?, 'instrument', ?)`)
      .bind(crypto.randomUUID(), trackId, instrument)
      .run()
  }
}

async function loadTracks(env: Env, versionId: string): Promise<AdminTrack[]> {
  const tracks = await env.DB.prepare(`SELECT * FROM tracks WHERE pack_version_id = ? ORDER BY sort_order, name`)
    .bind(versionId)
    .all<Record<string, unknown>>()
  const tags = await env.DB.prepare(
    `SELECT tt.track_id as trackId, tt.kind as kind, tt.value as value
     FROM track_tags tt
     JOIN tracks t ON t.id = tt.track_id
     WHERE t.pack_version_id = ?`,
  )
    .bind(versionId)
    .all<{ trackId: string; kind: string; value: string }>()
  const byTrack = new Map<string, { moods: string[]; instruments: string[] }>()
  for (const tag of tags.results ?? []) {
    const current = byTrack.get(tag.trackId) ?? { moods: [], instruments: [] }
    if (tag.kind === 'mood' && !current.moods.includes(tag.value)) current.moods.push(tag.value)
    if (tag.kind === 'instrument' && !current.instruments.includes(tag.value)) current.instruments.push(tag.value)
    byTrack.set(tag.trackId, current)
  }
  return (tracks.results ?? []).map((track) => {
    const id = String(track.id)
    const grouped = byTrack.get(id) ?? { moods: [], instruments: [] }
    const hasPreview = Boolean(track.preview_r2_key)
    return {
      id,
      name: String(track.name),
      durationSeconds: Number(track.duration_seconds),
      sortOrder: Number(track.sort_order),
      moods: grouped.moods,
      instruments: grouped.instruments,
      hasFullAudio: Boolean(track.full_r2_key),
      hasPreviewAudio: hasPreview,
      previewUrl: hasPreview ? `/api/previews/${id}` : null,
    }
  })
}

export async function listAdminPacks(env: Env): Promise<AdminPackSummary[]> {
  await ensureSeed(env.DB)
  const rows = await env.DB.prepare(
    `SELECT p.*,
            (SELECT version FROM pack_versions pv WHERE pv.pack_id = p.id ORDER BY published_at DESC LIMIT 1) as current_version,
            ${PACK_COUNT_SQL} as track_count
     FROM packs p
     ORDER BY p.updated_at DESC, p.title ASC`,
  ).all<Record<string, unknown>>()
  return (rows.results ?? []).map(serializeSummary)
}

export async function getAdminPack(env: Env, slug: string): Promise<AdminPackDetail | null> {
  await ensureSeed(env.DB)
  const pack = await env.DB.prepare(
    `SELECT p.*,
            (SELECT version FROM pack_versions pv WHERE pv.pack_id = p.id ORDER BY published_at DESC LIMIT 1) as current_version,
            ${PACK_COUNT_SQL} as track_count
     FROM packs p
     WHERE p.slug = ?`,
  )
    .bind(slug)
    .first<Record<string, unknown>>()
  if (!pack) return null
  const version = await currentVersion(env, String(pack.id))
  const tracks = version ? await loadTracks(env, String(version.id)) : []
  return {
    ...serializeSummary(pack),
    changelog: String(version?.changelog ?? 'Initial release'),
    reviewNotes: pack.review_notes ? String(pack.review_notes) : null,
    tracks,
  }
}

async function ensureVersion(env: Env, packId: string, changelog: string) {
  const existing = await currentVersion(env, packId)
  if (existing) return existing
  const now = Date.now()
  const id = crypto.randomUUID()
  const pack = await env.DB.prepare(`SELECT slug FROM packs WHERE id = ?`).bind(packId).first<{ slug: string }>()
  await env.DB.prepare(
    `INSERT INTO pack_versions (id, pack_id, version, changelog, zip_r2_key, published_at)
     VALUES (?, ?, 'v1', ?, ?, ?)`,
  )
    .bind(id, packId, changelog, pack ? `packs/${pack.slug}/v/v1/pack.zip` : null, now)
    .run()
  return currentVersion(env, packId)
}

export async function createAdminPack(env: Env, input: unknown): Promise<{ pack?: AdminPackDetail; error?: string; status?: number }> {
  const parsed = parsePackWrite(input, { trackCount: 0 })
  if (!parsed.ok) return { error: parsed.error, status: 400 }
  const existing = await env.DB.prepare(`SELECT id FROM packs WHERE slug = ?`).bind(parsed.value.slug).first()
  if (existing) return { error: 'A pack with that slug already exists', status: 409 }
  const now = Date.now()
  const packId = crypto.randomUUID()
  const versionId = crypto.randomUUID()
  await env.DB.prepare(
    `INSERT INTO packs (
      id, slug, title, description, kind, category, owner_type, owner_user_id,
      listing_status, listing_fee_cents_paid, commission_bps, review_notes,
      price_snapshot_cents, price_update_pass_cents, featured_eligible, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'platform', NULL, ?, 0, 0, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      packId,
      parsed.value.slug,
      parsed.value.title,
      parsed.value.description,
      parsed.value.kind,
      parsed.value.category,
      parsed.value.listingStatus,
      parsed.value.reviewNotes,
      parsed.value.priceSnapshotCents,
      parsed.value.priceUpdatePassCents,
      parsed.value.featuredEligible ? 1 : 0,
      now,
      now,
    )
    .run()
  await env.DB.prepare(
    `INSERT INTO pack_versions (id, pack_id, version, changelog, zip_r2_key, published_at)
     VALUES (?, ?, 'v1', ?, ?, ?)`,
  )
    .bind(versionId, packId, parsed.value.changelog, `packs/${parsed.value.slug}/v/v1/pack.zip`, now)
    .run()
  const pack = await getAdminPack(env, parsed.value.slug)
  return { pack: pack ?? undefined }
}

export async function updateAdminPack(
  env: Env,
  slug: string,
  input: unknown,
): Promise<{ pack?: AdminPackDetail; error?: string; status?: number }> {
  const current = await getAdminPack(env, slug)
  if (!current) return { error: 'Pack not found', status: 404 }
  const parsed = parsePackWrite(input, { trackCount: current.trackCount })
  if (!parsed.ok) return { error: parsed.error, status: 400 }
  if (parsed.value.slug !== slug) {
    const clash = await env.DB.prepare(`SELECT id FROM packs WHERE slug = ?`).bind(parsed.value.slug).first()
    if (clash) return { error: 'A pack with that slug already exists', status: 409 }
  }
  const now = Date.now()
  await env.DB.prepare(
    `UPDATE packs SET
      slug = ?, title = ?, description = ?, kind = ?, category = ?,
      listing_status = ?, review_notes = ?, price_snapshot_cents = ?,
      price_update_pass_cents = ?, featured_eligible = ?, updated_at = ?
     WHERE id = ?`,
  )
    .bind(
      parsed.value.slug,
      parsed.value.title,
      parsed.value.description,
      parsed.value.kind,
      parsed.value.category,
      parsed.value.listingStatus,
      parsed.value.reviewNotes,
      parsed.value.priceSnapshotCents,
      parsed.value.priceUpdatePassCents,
      parsed.value.featuredEligible ? 1 : 0,
      now,
      current.id,
    )
    .run()
  const version = await currentVersion(env, current.id)
  if (version) {
    await env.DB.prepare(`UPDATE pack_versions SET changelog = ? WHERE id = ?`)
      .bind(parsed.value.changelog, version.id)
      .run()
  }
  const pack = await getAdminPack(env, parsed.value.slug)
  return { pack: pack ?? undefined }
}

export async function deleteAdminPack(env: Env, slug: string): Promise<{ ok?: true; error?: string; status?: number }> {
  const pack = await env.DB.prepare(`SELECT id FROM packs WHERE slug = ?`).bind(slug).first<{ id: string }>()
  if (!pack) return { error: 'Pack not found', status: 404 }
  await env.DB.prepare(
    `DELETE FROM track_tags WHERE track_id IN (
      SELECT t.id FROM tracks t JOIN pack_versions pv ON pv.id = t.pack_version_id WHERE pv.pack_id = ?
    )`,
  )
    .bind(pack.id)
    .run()
  await env.DB.prepare(
    `DELETE FROM tracks WHERE pack_version_id IN (SELECT id FROM pack_versions WHERE pack_id = ?)`,
  )
    .bind(pack.id)
    .run()
  await env.DB.prepare(`DELETE FROM pack_versions WHERE pack_id = ?`).bind(pack.id).run()
  await env.DB.prepare(`DELETE FROM entitlements WHERE pack_id = ?`).bind(pack.id).run()
  await env.DB.prepare(`DELETE FROM purchases WHERE pack_id = ?`).bind(pack.id).run()
  await env.DB.prepare(`DELETE FROM download_events WHERE pack_id = ?`).bind(pack.id).run()
  await env.DB.prepare(`DELETE FROM listing_reviews WHERE pack_id = ?`).bind(pack.id).run()
  await env.DB.prepare(`DELETE FROM packs WHERE id = ?`).bind(pack.id).run()
  return { ok: true }
}

export async function createAdminTrack(
  env: Env,
  slug: string,
  input: unknown,
): Promise<{ pack?: AdminPackDetail; error?: string; status?: number }> {
  const pack = await getAdminPack(env, slug)
  if (!pack) return { error: 'Pack not found', status: 404 }
  const parsed = parseTrackWrite(input)
  if (!parsed.ok) return { error: parsed.error, status: 400 }
  const version = await ensureVersion(env, pack.id, pack.changelog)
  if (!version) return { error: 'Pack version is missing', status: 500 }
  const maxOrder = await env.DB.prepare(`SELECT MAX(sort_order) as maxOrder FROM tracks WHERE pack_version_id = ?`)
    .bind(version.id)
    .first<{ maxOrder: number | null }>()
  const sortOrder = parsed.value.sortOrder ?? Number(maxOrder?.maxOrder ?? -1) + 1
  const trackId = crypto.randomUUID()
  await env.DB.prepare(
    `INSERT INTO tracks (
      id, pack_version_id, name, duration_seconds, full_r2_key, preview_r2_key,
      content_sha256, chromaprint, clap_vector_id, duplicate_of_track_id, sort_order
    ) VALUES (?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, ?)`,
  )
    .bind(trackId, version.id, parsed.value.name, parsed.value.durationSeconds, sortOrder)
    .run()
  await replaceTrackTags(env, trackId, parsed.value.moods, parsed.value.instruments)
  await env.DB.prepare(`UPDATE packs SET updated_at = ? WHERE id = ?`).bind(Date.now(), pack.id).run()
  return { pack: (await getAdminPack(env, slug)) ?? undefined }
}

export async function deleteAdminTrack(
  env: Env,
  slug: string,
  trackId: string,
): Promise<{ pack?: AdminPackDetail; error?: string; status?: number }> {
  const pack = await getAdminPack(env, slug)
  if (!pack) return { error: 'Pack not found', status: 404 }
  const version = await currentVersion(env, pack.id)
  if (!version) return { error: 'Pack version is missing', status: 404 }
  const track = await env.DB.prepare(`SELECT id FROM tracks WHERE id = ? AND pack_version_id = ?`)
    .bind(trackId, version.id)
    .first()
  if (!track) return { error: 'Track not found', status: 404 }
  await env.DB.prepare(`DELETE FROM track_tags WHERE track_id = ?`).bind(trackId).run()
  await env.DB.prepare(`DELETE FROM tracks WHERE id = ?`).bind(trackId).run()
  await env.DB.prepare(`UPDATE packs SET updated_at = ? WHERE id = ?`).bind(Date.now(), pack.id).run()
  return { pack: (await getAdminPack(env, slug)) ?? undefined }
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function storeTrackAudio(
  env: Env,
  slug: string,
  trackId: string,
  file: File,
): Promise<{ pack?: AdminPackDetail; error?: string; status?: number }> {
  const pack = await getAdminPack(env, slug)
  if (!pack) return { error: 'Pack not found', status: 404 }
  const version = await currentVersion(env, pack.id)
  if (!version) return { error: 'Pack version is missing', status: 404 }
  const track = await env.DB.prepare(`SELECT * FROM tracks WHERE id = ? AND pack_version_id = ?`)
    .bind(trackId, version.id)
    .first<Record<string, unknown>>()
  if (!track) return { error: 'Track not found', status: 404 }
  const ext = fileExtension(file.name)
  if (!AUDIO_EXTENSIONS.has(ext)) return { error: 'Upload ogg, wav, flac, mp3, or opus audio', status: 400 }
  if (file.size > MAX_AUDIO_UPLOAD_BYTES) return { error: 'Audio file is too large', status: 413 }
  const bytes = await file.arrayBuffer()
  if (bytes.byteLength === 0) return { error: 'Audio file is empty', status: 400 }
  const sniffed = sniffUpload(new Uint8Array(bytes))
  if (!sniffed || sniffed === 'zip' || !uploadMatchesExtension(sniffed, ext)) {
    return { error: 'Audio file type does not match its contents', status: 400 }
  }
  const hash = await sha256Hex(bytes)
  const hashes = await env.DB.prepare(`SELECT content_sha256 as hash FROM tracks WHERE content_sha256 IS NOT NULL AND id != ?`)
    .bind(trackId)
    .all<{ hash: string }>()
  const exact = findExactDuplicate(
    (hashes.results ?? []).map((row) => row.hash),
    hash,
  )
  const decision = shouldAutoRejectDuplicate({ exactHashHit: Boolean(exact), chromaprintHit: false, clapCosine: null })
  if (decision === 'reject') return { error: 'This file is already in the catalog', status: 409 }
  const versionLabel = String(version.version)
  const key = `packs/${pack.slug}/v/${versionLabel}/tracks/${trackId}${ext}`
  await env.AUDIO.put(key, bytes, {
    httpMetadata: { contentType: audioContentType(ext) },
  })
  const previewKey = Number(track.sort_order) === 0 ? key : (track.preview_r2_key as string | null)
  await env.DB.prepare(
    `UPDATE tracks SET full_r2_key = ?, preview_r2_key = ?, content_sha256 = ? WHERE id = ?`,
  )
    .bind(key, previewKey, hash, trackId)
    .run()
  await env.DB.prepare(`UPDATE packs SET updated_at = ? WHERE id = ?`).bind(Date.now(), pack.id).run()
  return { pack: (await getAdminPack(env, slug)) ?? undefined }
}

export async function storePackArchive(
  env: Env,
  slug: string,
  file: File,
): Promise<{ pack?: AdminPackDetail; error?: string; status?: number }> {
  const pack = await getAdminPack(env, slug)
  if (!pack) return { error: 'Pack not found', status: 404 }
  const version = await ensureVersion(env, pack.id, pack.changelog)
  if (!version) return { error: 'Pack version is missing', status: 500 }
  const ext = fileExtension(file.name, '.zip')
  if (ext !== '.zip') return { error: 'Upload a .zip pack archive', status: 400 }
  if (file.size > MAX_ZIP_UPLOAD_BYTES) return { error: 'Archive is too large', status: 413 }
  const bytes = await file.arrayBuffer()
  if (bytes.byteLength === 0) return { error: 'Archive is empty', status: 400 }
  if (sniffUpload(new Uint8Array(bytes)) !== 'zip') return { error: 'Archive is not a zip file', status: 400 }
  const versionLabel = String(version.version)
  const key = `packs/${pack.slug}/v/${versionLabel}/pack.zip`
  await env.AUDIO.put(key, bytes, {
    httpMetadata: { contentType: 'application/zip' },
  })
  await env.DB.prepare(`UPDATE pack_versions SET zip_r2_key = ? WHERE id = ?`).bind(key, version.id).run()
  await env.DB.prepare(`UPDATE packs SET updated_at = ? WHERE id = ?`).bind(Date.now(), pack.id).run()
  return { pack: (await getAdminPack(env, slug)) ?? undefined }
}

export async function readUploadFile(form: FormData, field = 'file'): Promise<File | null> {
  const value = form.get(field)
  return value instanceof File ? value : null
}
