import { DEMO_PACKS } from './demo-library.generated.ts'
import type { DemoPack } from './demo-library.ts'
import { AI_DISCLOSURE } from './types.ts'

export interface SeedStatement {
  sql: string
  params: unknown[]
}

/**
 * Expands the generated demo catalogue into D1 inserts.
 *
 * Every row mirrors what the operator CLI would have written, including listing
 * status: only packs that actually cleared the 30-track policy are `live`, and only
 * tracks whose audio was uploaded carry an R2 key. Nothing here fabricates a key or a
 * count the catalogue cannot serve.
 */
export function buildSeedStatements(created = Date.now(), packs: DemoPack[] = DEMO_PACKS): SeedStatement[] {
  const statements: SeedStatement[] = []

  for (const pack of packs) {
    const versionId = `ver_${pack.slug}_${pack.version}`
    statements.push({
      sql: `INSERT OR IGNORE INTO packs (
        id, slug, title, description, kind, category, owner_type, owner_user_id,
        listing_status, listing_fee_cents_paid, commission_bps, review_notes,
        price_snapshot_cents, price_update_pass_cents, featured_eligible, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'platform', NULL, ?, 0, 0, ?, ?, ?, ?, ?, ?)`,
      params: [
        pack.id,
        pack.slug,
        pack.title,
        pack.description,
        pack.kind,
        pack.category,
        pack.listingStatus,
        AI_DISCLOSURE,
        pack.priceSnapshotCents,
        pack.priceUpdatePassCents,
        pack.featuredEligible ? 1 : 0,
        created,
        created,
      ],
    })
    statements.push({
      sql: `INSERT OR IGNORE INTO pack_versions (id, pack_id, version, changelog, zip_r2_key, published_at)
            VALUES (?, ?, ?, ?, ?, ?)`,
      params: [versionId, pack.id, pack.version, pack.changelog, pack.zipKey, created],
    })

    for (const track of pack.tracks) {
      statements.push({
        sql: `INSERT OR IGNORE INTO tracks (
          id, pack_version_id, name, duration_seconds, full_r2_key, preview_r2_key,
          content_sha256, chromaprint, clap_vector_id, duplicate_of_track_id, sort_order
        ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?)`,
        params: [
          track.id,
          versionId,
          track.name,
          track.durationSeconds,
          track.fullKey,
          track.previewKey,
          track.sortOrder,
        ],
      })
      for (const [index, mood] of track.moods.entries()) {
        statements.push({
          sql: `INSERT OR IGNORE INTO track_tags (id, track_id, kind, value) VALUES (?, ?, 'mood', ?)`,
          params: [`tag_${track.id}_mood_${index}`, track.id, mood],
        })
      }
      for (const [index, instrument] of track.instruments.entries()) {
        statements.push({
          sql: `INSERT OR IGNORE INTO track_tags (id, track_id, kind, value) VALUES (?, ?, 'instrument', ?)`,
          params: [`tag_${track.id}_ins_${index}`, track.id, instrument],
        })
      }
    }
  }

  return statements
}
