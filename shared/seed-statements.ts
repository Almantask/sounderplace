import { STARTER_PACKS, trackName } from './starter-library.ts'
import { AI_DISCLOSURE } from './types.ts'

export interface SeedStatement {
  sql: string
  params: unknown[]
}

export function buildSeedStatements(paidBoss = true, created = Date.now()): SeedStatement[] {
  const statements: SeedStatement[] = []
  const packs = [...STARTER_PACKS]

  if (paidBoss) {
    packs.push({
      slug: 'boss-ambience',
      title: 'Boss',
      kind: 'ambience',
      category: 'boss',
      description: 'Dark orchestral boss beds. Snapshot $9, or $14 with an update pass for later versions.',
      moods: ['menacing', 'epic'],
      instruments: ['brass', 'taiko', 'choir'],
      trackCount: 30,
    })
  }

  for (const pack of packs) {
    const packId = `pack_${pack.slug}`
    const versionId = `ver_${pack.slug}_v1`
    // Seed ids are stable fixtures for local/dev data. Access control must not depend on them being secret.
    const paid = pack.slug === 'boss-ambience'
    statements.push({
      sql: `INSERT OR IGNORE INTO packs (
        id, slug, title, description, kind, category, owner_type, owner_user_id,
        listing_status, listing_fee_cents_paid, commission_bps, review_notes,
        price_snapshot_cents, price_update_pass_cents, featured_eligible, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'platform', NULL, 'live', 0, 0, ?, ?, ?, 1, ?, ?)`,
      params: [
        packId,
        pack.slug,
        pack.title,
        pack.description,
        pack.kind,
        pack.category,
        AI_DISCLOSURE,
        paid ? 900 : 0,
        paid ? 1400 : 0,
        created,
        created,
      ],
    })
    statements.push({
      sql: `INSERT OR IGNORE INTO pack_versions (id, pack_id, version, changelog, zip_r2_key, published_at)
            VALUES (?, ?, 'v1', 'Initial curated release', ?, ?)`,
      params: [versionId, packId, `packs/${pack.slug}/v/v1/pack.zip`, created],
    })

    for (let i = 0; i < pack.trackCount; i += 1) {
      const trackId = `track_${pack.slug}_${String(i + 1).padStart(2, '0')}`
      const isPreviewTrack = i === 0
      const trackR2Key = `packs/${pack.slug}/v/v1/tracks/${trackId}.ogg`
      statements.push({
        sql: `INSERT OR IGNORE INTO tracks (
          id, pack_version_id, name, duration_seconds, full_r2_key, preview_r2_key,
          content_sha256, chromaprint, clap_vector_id, duplicate_of_track_id, sort_order
        ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?)`,
        params: [
          trackId,
          versionId,
          trackName(pack.title, i),
          pack.kind === 'fx' ? 3 : 90,
          trackR2Key,
          isPreviewTrack ? trackR2Key : null,
          i,
        ],
      })
      for (const mood of pack.moods) {
        statements.push({
          sql: `INSERT OR IGNORE INTO track_tags (id, track_id, kind, value) VALUES (?, ?, 'mood', ?)`,
          params: [`tag_${trackId}_mood_${mood}`, trackId, mood],
        })
      }
      for (const instrument of pack.instruments) {
        statements.push({
          sql: `INSERT OR IGNORE INTO track_tags (id, track_id, kind, value) VALUES (?, ?, 'instrument', ?)`,
          params: [`tag_${trackId}_ins_${instrument}`, trackId, instrument],
        })
      }
    }
  }

  return statements
}
