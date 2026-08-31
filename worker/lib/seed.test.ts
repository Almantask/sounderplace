import { describe, expect, it } from 'vitest'
import { DEMO_PACKS } from '../../shared/demo-library.generated.ts'
import { buildSeedStatements } from '../../shared/seed-statements.ts'

const packInserts = (rows: ReturnType<typeof buildSeedStatements>) =>
  rows.filter((row) => row.sql.includes('INSERT OR IGNORE INTO packs'))

describe('catalog seed', () => {
  it('inserts one row per pack in the generated demo catalogue', () => {
    expect(packInserts(buildSeedStatements())).toHaveLength(DEMO_PACKS.length)
  })

  it('inserts every track with its tags', () => {
    const statements = buildSeedStatements()
    const tracks = statements.filter((row) => row.sql.includes('INSERT OR IGNORE INTO tracks'))
    const tags = statements.filter((row) => row.sql.includes('INSERT OR IGNORE INTO track_tags'))
    const expectedTracks = DEMO_PACKS.reduce((total, pack) => total + pack.tracks.length, 0)
    const expectedTags = DEMO_PACKS.reduce(
      (total, pack) => total + pack.tracks.reduce((n, track) => n + track.moods.length + track.instruments.length, 0),
      0,
    )
    expect(tracks).toHaveLength(expectedTracks)
    expect(tags).toHaveLength(expectedTags)
  })

  it('carries each pack’s real listing status rather than forcing everything live', () => {
    const statuses = new Set(DEMO_PACKS.map((pack) => pack.listingStatus))
    expect(statuses.size).toBeGreaterThan(1)
    for (const pack of DEMO_PACKS) {
      const insert = packInserts(buildSeedStatements()).find((row) => row.params.includes(pack.slug))
      expect(insert?.params).toContain(pack.listingStatus)
    }
  })

  it('only lists packs that meet the thirty-track policy', () => {
    for (const pack of DEMO_PACKS) {
      if (pack.listingStatus === 'live') expect(pack.tracks.length).toBeGreaterThanOrEqual(30)
      else expect(pack.tracks.length).toBeLessThan(30)
    }
  })

  it('never seeds an R2 key for audio that was not uploaded', () => {
    for (const pack of DEMO_PACKS) {
      for (const track of pack.tracks) {
        if (track.previewKey === null) continue
        expect(pack.listingStatus).toBe('live')
        expect(track.sortOrder).toBe(0)
      }
    }
  })

  it('publishes exactly one preview per live pack', () => {
    for (const pack of DEMO_PACKS.filter((p) => p.listingStatus === 'live')) {
      expect(pack.tracks.filter((track) => track.previewKey !== null)).toHaveLength(1)
    }
  })

  it('prices at least one live pack so the paid flows are reachable', () => {
    const paid = DEMO_PACKS.filter((pack) => pack.listingStatus === 'live' && pack.priceSnapshotCents > 0)
    expect(paid.length).toBeGreaterThan(0)
    for (const pack of paid) expect(pack.priceUpdatePassCents).toBeGreaterThanOrEqual(pack.priceSnapshotCents)
  })
})
