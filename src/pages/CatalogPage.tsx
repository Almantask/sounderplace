import { useEffect, useMemo, useState } from 'react'
import type { PackSummary } from '@shared/types'
import { PackCard } from '@/components/catalog/PackCard'
import { PackFilters, type FilterValue } from '@/components/catalog/PackFilters'
import { api } from '@/lib/api'

export function CatalogPage() {
  const [filters, setFilters] = useState<FilterValue>({
    kind: 'all',
    category: '',
    mood: '',
    instrument: '',
    query: '',
  })
  const [packs, setPacks] = useState<Array<PackSummary & { moods?: string[]; instruments?: string[] }>>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const params = new URLSearchParams()
    if (filters.kind !== 'all') params.set('kind', filters.kind)
    if (filters.category) params.set('category', filters.category)
    if (filters.mood) params.set('mood', filters.mood)
    if (filters.instrument) params.set('instrument', filters.instrument)
    if (filters.query) params.set('query', filters.query)
    setLoading(true)
    api
      .packs(params)
      .then((data) => {
        setPacks(data.packs as Array<PackSummary & { moods?: string[]; instruments?: string[] }>)
        setError(null)
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [filters])

  const categories = useMemo(() => unique(packs.map((pack) => pack.category)), [packs])
  const moods = useMemo(() => unique(packs.flatMap((pack) => pack.moods ?? [])), [packs])
  const instruments = useMemo(() => unique(packs.flatMap((pack) => pack.instruments ?? [])), [packs])

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-4xl">Catalog</h1>
        <p className="mt-2 text-muted">Filter by kind, category, mood, and instruments. Packs are themed sets of 30+ tracks.</p>
      </header>
      <PackFilters
        value={filters}
        onChange={setFilters}
        categories={categories}
        moods={moods}
        instruments={instruments}
      />
      {loading ? <p role="status">Loading packs…</p> : null}
      {error ? (
        <p role="alert" className="text-red-300">
          {error}
        </p>
      ) : null}
      {!loading && packs.length === 0 ? <p>No packs match those filters.</p> : null}
      <div className="grid gap-4 md:grid-cols-2">
        {packs.map((pack) => (
          <PackCard key={pack.id} pack={pack} />
        ))}
      </div>
    </div>
  )
}

function unique(values: string[]) {
  return [...new Set(values)].sort()
}
