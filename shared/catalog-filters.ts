import type { PackKind } from './types.ts'

export interface CatalogFilters {
  kind?: PackKind | 'all'
  category?: string
  mood?: string
  instrument?: string
  query?: string
}

export interface FilterablePack {
  title: string
  kind: PackKind
  category: string
  moods: string[]
  instruments: string[]
}

export function matchesCatalogFilters(pack: FilterablePack, filters: CatalogFilters): boolean {
  if (filters.kind && filters.kind !== 'all' && pack.kind !== filters.kind) return false
  if (filters.category && pack.category !== filters.category) return false
  if (filters.mood && !pack.moods.includes(filters.mood)) return false
  if (filters.instrument && !pack.instruments.includes(filters.instrument)) return false
  if (filters.query) {
    const haystack = `${pack.title} ${pack.category} ${pack.moods.join(' ')} ${pack.instruments.join(' ')}`.toLowerCase()
    if (!haystack.includes(filters.query.trim().toLowerCase())) return false
  }
  return true
}
