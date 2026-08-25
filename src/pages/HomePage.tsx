import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { PackSummary } from '@shared/types'
import { AI_DISCLOSURE } from '@shared/types'
import { PackCard } from '@/components/catalog/PackCard'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'

export function HomePage() {
  const [featured, setFeatured] = useState<PackSummary[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api
      .featured()
      .then((data) => setFeatured(data.packs))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-10">
      <section className="max-w-3xl">
        <p className="text-xs uppercase tracking-[0.3em] text-gold">TTRPG audio marketplace</p>
        <h1 className="font-display mt-2 text-5xl leading-tight md:text-6xl">Sunderplace</h1>
        <p className="mt-4 text-lg text-muted">
          Human-reviewed ambience and sound-effect packs. No subscription — buy a snapshot, or add a one-time update
          pass. A generous free library covers the beds and one-shots you reach for every session.
        </p>
        <p className="mt-3 text-sm text-muted">{AI_DISCLOSURE}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild>
            <Link to="/catalog">Browse the catalog</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/ecosystem">Tools & donate</Link>
          </Button>
        </div>
      </section>
      <section>
        <h2 className="font-display text-3xl">Featured packs</h2>
        <p className="mt-1 text-sm text-muted">Ranked by unique downloads and purchases in the last 30 days.</p>
        {loading ? <p role="status">Loading featured packs…</p> : null}
        {error ? (
          <p role="alert" className="mt-4 text-sm text-red-300">
            {error}. Start the API with <code>npm run dev:full</code> if you are on the UI-only server.
          </p>
        ) : null}
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {featured.map((pack) => (
            <PackCard key={pack.id} pack={pack} />
          ))}
        </div>
        {!loading && !error && featured.length === 0 ? (
          <p className="mt-4 text-muted">No featured activity yet — the free starter packs are in the catalog.</p>
        ) : null}
      </section>
    </div>
  )
}
