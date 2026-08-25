import { describe, expect, it } from 'vitest'
import { matchesCatalogFilters } from './catalog-filters.ts'

const tavern = {
  title: 'Tavern',
  kind: 'ambience' as const,
  category: 'tavern',
  moods: ['lively', 'festive'],
  instruments: ['fiddle', 'lute'],
}

describe('catalog filters', () => {
  it('matches by kind, category, mood, and instrument', () => {
    expect(matchesCatalogFilters(tavern, { kind: 'ambience' })).toBe(true)
    expect(matchesCatalogFilters(tavern, { kind: 'fx' })).toBe(false)
    expect(matchesCatalogFilters(tavern, { category: 'tavern' })).toBe(true)
    expect(matchesCatalogFilters(tavern, { mood: 'lively' })).toBe(true)
    expect(matchesCatalogFilters(tavern, { instrument: 'harp' })).toBe(false)
  })

  it('matches a case-insensitive search query against title and tags', () => {
    expect(matchesCatalogFilters(tavern, { query: 'FIDDLE' })).toBe(true)
    expect(matchesCatalogFilters(tavern, { query: 'dungeon' })).toBe(false)
  })
})
