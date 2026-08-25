import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { formatUsd } from '@shared/pricing'
import type { PackDetail } from '@shared/types'
import { TrackList } from '@/components/catalog/TrackList'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { api } from '@/lib/api'

export function PackPage() {
  const { slug } = useParams()
  const [state, setState] = useState<{
    pack: PackDetail & { moods: string[]; instruments: string[] }
    checkoutKind: string
    upgradeDeltaCents: number
    entitlement: { license: string; snapshotVersion: string } | null
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!slug) return
    api
      .pack(slug)
      .then(setState)
      .catch((err: Error) => setError(err.message))
  }, [slug])

  async function buy(license: 'snapshot' | 'update_pass' | 'upgrade') {
    if (!slug) return
    setBusy(true)
    try {
      const { url } = await api.checkout(slug, license)
      window.location.assign(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout failed')
      setBusy(false)
    }
  }

  async function claim() {
    if (!slug) return
    setBusy(true)
    try {
      await api.claim(slug)
      const next = await api.pack(slug)
      setState(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add pack')
    } finally {
      setBusy(false)
    }
  }

  if (error && !state) {
    return (
      <p role="alert" className="text-red-300">
        {error}
      </p>
    )
  }
  if (!state) return <p role="status">Loading pack…</p>

  const { pack, checkoutKind, upgradeDeltaCents, entitlement } = state

  return (
    <article className="space-y-8">
      <header className="space-y-3">
        <p className="text-xs uppercase tracking-[0.3em] text-gold">
          {pack.kind} · {pack.category}
        </p>
        <h1 className="font-display text-5xl">{pack.title}</h1>
        <p className="max-w-3xl text-muted">{pack.description}</p>
        <p className="text-sm text-gold">{pack.aiDisclosure}</p>
        <p className="text-sm text-muted">{pack.buyerLicense}</p>
      </header>
      <Card className="space-y-4">
        <h2 className="font-display text-2xl">License</h2>
        {checkoutKind === 'owned' ? (
          <p>
            You have an update pass. Download from your{' '}
            <Link className="text-gold" to="/library">
              library
            </Link>
            .
          </p>
        ) : null}
        {checkoutKind === 'free' ? (
          <div className="flex flex-wrap gap-3">
            <Button onClick={claim} disabled={busy}>
              Add free pack to library
            </Button>
            <Button variant="outline" asChild>
              <a href={`/api/downloads/${pack.slug}/${pack.currentVersion}`}>Download {pack.currentVersion}</a>
            </Button>
          </div>
        ) : null}
        {checkoutKind === 'snapshot' ? (
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => buy('snapshot')} disabled={busy}>
              Buy snapshot {formatUsd(pack.priceSnapshotCents)}
            </Button>
            <Button variant="outline" onClick={() => buy('update_pass')} disabled={busy}>
              Buy with update pass {formatUsd(pack.priceUpdatePassCents)}
            </Button>
          </div>
        ) : null}
        {checkoutKind === 'upgrade' ? (
          <div className="space-y-2">
            <p className="text-sm text-muted">
              You own snapshot {entitlement?.snapshotVersion}. Unlock later versions for{' '}
              {formatUsd(upgradeDeltaCents)}.
            </p>
            <Button onClick={() => buy('upgrade')} disabled={busy}>
              Unlock updates {formatUsd(upgradeDeltaCents)}
            </Button>
          </div>
        ) : null}
        {error ? <p className="text-sm text-red-300">{error}</p> : null}
      </Card>
      <section>
        <h2 className="font-display text-2xl">Tracks</h2>
        <TrackList tracks={pack.tracks} />
      </section>
    </article>
  )
}
