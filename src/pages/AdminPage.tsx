import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { MIN_LIVE_TRACKS } from '@shared/admin'
import { formatUsd } from '@shared/pricing'
import type { AdminPackSummary } from '@shared/types'
import { api } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

export function AdminPage() {
  const navigate = useNavigate()
  const [packs, setPacks] = useState<AdminPackSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api
      .adminPacks()
      .then((data) => {
        setPacks(data.packs)
        setError(null)
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    setBusy(true)
    setError(null)
    try {
      const created = await api.createAdminPack({
        title: String(data.get('title') ?? ''),
        slug: String(data.get('slug') ?? ''),
        description: String(data.get('description') ?? ''),
        kind: String(data.get('kind') ?? 'ambience'),
        category: String(data.get('category') ?? ''),
        snapshotDollars: String(data.get('snapshotDollars') ?? '0'),
        updatePassDollars: String(data.get('updatePassDollars') ?? '0'),
      })
      form.reset()
      navigate(`/admin/packs/${created.pack.slug}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create pack')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.3em] text-gold">Operator</p>
        <h1 className="font-display text-4xl md:text-5xl">Catalog admin</h1>
        <p className="max-w-3xl text-muted">
          Create packs, edit listing metadata, add tracks, and upload audio. Drafts stay hidden from the public
          catalog until you publish them. A live pack needs at least {MIN_LIVE_TRACKS} themed tracks.
        </p>
      </header>

      {loading ? <p role="status">Loading catalog…</p> : null}
      {error ? (
        <p role="alert" className="text-red-300">
          {error}
        </p>
      ) : null}

      <Card className="space-y-4">
        <h2 className="font-display text-2xl">New pack</h2>
        <form className="grid gap-4 md:grid-cols-2" onSubmit={onCreate}>
          <Field label="Title" htmlFor="pack-title">
            <Input id="pack-title" name="title" required maxLength={120} />
          </Field>
          <Field label="Slug" htmlFor="pack-slug">
            <Input id="pack-slug" name="slug" placeholder="auto from title" />
          </Field>
          <Field label="Kind" htmlFor="pack-kind">
            <select
              id="pack-kind"
              name="kind"
              defaultValue="ambience"
              className="h-10 w-full rounded-md border border-line bg-leather px-3 text-ink focus-visible:outline-2 focus-visible:outline-gold"
            >
              <option value="ambience">Ambience</option>
              <option value="fx">Sound effects</option>
            </select>
          </Field>
          <Field label="Category" htmlFor="pack-category">
            <Input id="pack-category" name="category" required />
          </Field>
          <div className="md:col-span-2">
            <Field label="Description" htmlFor="pack-description">
              <Textarea id="pack-description" name="description" required />
            </Field>
          </div>
          <Field label="Snapshot price (USD)" htmlFor="pack-snapshot">
            <Input id="pack-snapshot" name="snapshotDollars" type="number" min="0" step="0.01" defaultValue="0" />
          </Field>
          <Field label="Update pass price (USD)" htmlFor="pack-update">
            <Input id="pack-update" name="updatePassDollars" type="number" min="0" step="0.01" defaultValue="0" />
          </Field>
          <div>
            <Button type="submit" disabled={busy}>
              {busy ? 'Creating…' : 'Create pack'}
            </Button>
          </div>
        </form>
      </Card>

      <section className="space-y-4">
        <h2 className="font-display text-2xl">Packs</h2>
        {!loading && packs.length === 0 ? <p className="text-muted">No packs in the catalog yet.</p> : null}
        <div className="grid gap-4">
          {packs.map((pack) => (
            <Card key={pack.id} className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link to={`/admin/packs/${pack.slug}`} className="font-display text-2xl hover:text-gold">
                    {pack.title}
                  </Link>
                  <Badge>{pack.listingStatus.replaceAll('_', ' ')}</Badge>
                </div>
                <p className="text-sm text-muted">
                  {pack.trackCount} tracks · {pack.kind} · {pack.category} · {formatUsd(pack.priceSnapshotCents)}
                </p>
              </div>
              <Button variant="outline" asChild>
                <Link to={`/admin/packs/${pack.slug}`}>Edit</Link>
              </Button>
            </Card>
          ))}
        </div>
      </section>
    </div>
  )
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor: string
  children: ReactNode
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="text-sm text-ink">
        {label}
      </label>
      {children}
    </div>
  )
}
