import { buildSeedStatements } from '../../shared/seed-statements.ts'
import { describe, expect, it } from 'vitest'

describe('catalog seed', () => {
  it('inserts eleven themed packs including ten free starters and one paid boss pack', () => {
    const statements = buildSeedStatements(true)
    const packInserts = statements.filter((row) => row.sql.includes('INSERT OR IGNORE INTO packs'))
    expect(packInserts).toHaveLength(11)
    const boss = packInserts.find((row) => row.params.includes('boss-ambience'))
    expect(boss?.params).toContain(900)
    expect(boss?.params).toContain(1400)
  })

  it('creates thirty tracks plus mood and instrument tags per pack', () => {
    const statements = buildSeedStatements(false)
    const tracks = statements.filter((row) => row.sql.includes('INSERT OR IGNORE INTO tracks'))
    const tags = statements.filter((row) => row.sql.includes('INSERT OR IGNORE INTO track_tags'))
    expect(tracks).toHaveLength(300)
    expect(tags.length).toBeGreaterThan(300)
  })
})
