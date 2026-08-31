import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { LISTING_STATUSES, MIN_LIVE_TRACKS } from '@shared/admin'
import type { AdminPackDetail } from '@shared/types'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

export function AdminPackPage() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const [pack, setPack] = useState<AdminPackDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!slug) return
    api
      .adminPack(slug)
      .then((data) => {
        setPack(data.pack)
        setError(null)
      })
      .catch((err: Error) => setError(err.message))
  }, [slug])

  async function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!slug) return
    const data = new FormData(event.currentTarget)
    setBusy(true)
    setError(null)
    try {
      const result = await api.updateAdminPack(slug, {
        title: String(data.get('title') ?? ''),
        slug: String(data.get('slug') ?? ''),
        description: String(data.get('description') ?? ''),
        kind: String(data.get('kind') ?? 'ambience'),
        category: String(data.get('category') ?? ''),
        listingStatus: String(data.get('listingStatus') ?? 'draft'),
        snapshotDollars: String(data.get('snapshotDollars') ?? '0'),
        updatePassDollars: String(data.get('updatePassDollars') ?? '0'),
        featuredEligible: data.get('featuredEligible') === 'on',
        changelog: String(data.get('changelog') ?? ''),
        reviewNotes: String(data.get('reviewNotes') ?? ''),
      })
      setPack(result.pack)
      if (result.pack.slug !== slug) navigate(`/admin/packs/${result.pack.slug}`, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save pack')
    } finally {
      setBusy(false)
    }
  }

  async function onAddTrack(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!slug) return
    const form = event.currentTarget
    const data = new FormData(form)
    setBusy(true)
    setError(null)
    try {
      const result = await api.createAdminTrack(slug, {
        name: String(data.get('name') ?? ''),
        durationSeconds: Number(data.get('durationSeconds')),
        moods: String(data.get('moods') ?? ''),
        instruments: String(data.get('instruments') ?? ''),
      })
      setPack(result.pack)
      form.reset()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add track')
    } finally {
      setBusy(false)
    }
  }

  async function onRemoveTrack(trackId: string, name: string) {
    if (!slug) return
    if (!window.confirm(`Remove ${name} from this pack?`)) return
    setBusy(true)
    setError(null)
    try {
      const result = await api.deleteAdminTrack(slug, trackId)
      setPack(result.pack)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove track')
    } finally {
      setBusy(false)
    }
  }

  async function onUploadAudio(trackId: string, file: File | undefined) {
    if (!slug || !file) return
    setBusy(true)
    setError(null)
    try {
      const result = await api.uploadAdminTrackAudio(slug, trackId, file)
      setPack(result.pack)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload audio')
    } finally {
      setBusy(false)
    }
  }

  async function onUploadArchive(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!slug) return
    const file = (event.currentTarget.elements.namedItem('archive') as HTMLInputElement | null)?.files?.[0]
    if (!file) {
      setError('Choose a zip archive to upload')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = await api.uploadAdminPackArchive(slug, file)
      setPack(result.pack)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload archive')
    } finally {
      setBusy(false)
    }
  }

  async function onDeletePack() {
    if (!slug || !pack) return
    if (!window.confirm(`Delete ${pack.title} and all of its tracks?`)) return
    setBusy(true)
    try {
      const result = await api.deleteAdminPack(slug)
      // A pack someone has paid for is delisted instead of deleted, so that the purchase
      // record and the buyer's licence survive. Say so rather than implying it is gone.
      if (result.archived) {
        window.alert(
          `${pack.title} has ${result.purchases} purchase(s), so it was delisted rather than deleted. ` +
            'Buyers keep their licence and the purchase record is intact.',
        )
      }
      navigate('/admin')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete pack')
      setBusy(false)
    }
  }

  if (error && !pack) {
    return (
      <p role="alert" className="text-red-300">
        {error}
      </p>
    )
  }
  if (!pack) return <p role="status">Loading pack…</p>

  const dollars = (cents: number) => (cents / 100).toFixed(2)

  return (
    <article className="space-y-8">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.3em] text-gold">
          <Link to="/admin" className="hover:text-gold-bright">
            Catalog admin
          </Link>
        </p>
        <h1 className="font-display text-4xl md:text-5xl">Edit {pack.title}</h1>
        <p className="text-sm text-muted">
          {pack.trackCount} tracks · {pack.currentVersion} · {pack.listingStatus.replaceAll('_', ' ')}. Live listings need
          at least {MIN_LIVE_TRACKS} tracks.
        </p>
      </header>

      {error ? (
        <p role="alert" className="text-red-300">
          {error}
        </p>
      ) : null}

      <Card>
        <form className="grid gap-4 md:grid-cols-2" onSubmit={onSave}>
          <Field label="Title" htmlFor="edit-title">
            <Input id="edit-title" name="title" required defaultValue={pack.title} key={`${pack.slug}-title`} />
          </Field>
          <Field label="Slug" htmlFor="edit-slug">
            <Input id="edit-slug" name="slug" required defaultValue={pack.slug} key={`${pack.slug}-slug`} />
          </Field>
          <Field label="Kind" htmlFor="edit-kind">
            <select
              id="edit-kind"
              name="kind"
              defaultValue={pack.kind}
              key={`${pack.slug}-kind`}
              className="h-10 w-full rounded-md border border-line bg-leather px-3 text-ink focus-visible:outline-2 focus-visible:outline-gold"
            >
              <option value="ambience">Ambience</option>
              <option value="fx">Sound effects</option>
            </select>
          </Field>
          <Field label="Category" htmlFor="edit-category">
            <Input id="edit-category" name="category" required defaultValue={pack.category} key={`${pack.slug}-category`} />
          </Field>
          <div className="md:col-span-2">
            <Field label="Description" htmlFor="edit-description">
              <Textarea
                id="edit-description"
                name="description"
                required
                defaultValue={pack.description}
                key={`${pack.slug}-description`}
              />
            </Field>
          </div>
          <Field label="Listing status" htmlFor="edit-status">
            <select
              id="edit-status"
              name="listingStatus"
              defaultValue={pack.listingStatus}
              key={`${pack.slug}-status`}
              className="h-10 w-full rounded-md border border-line bg-leather px-3 text-ink focus-visible:outline-2 focus-visible:outline-gold"
            >
              {LISTING_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </Field>
          <label className="flex items-center gap-2 self-end text-sm text-ink">
            <input type="checkbox" name="featuredEligible" defaultChecked={pack.featuredEligible} key={`${pack.slug}-featured`} />
            Featured eligible
          </label>
          <Field label="Snapshot price (USD)" htmlFor="edit-snapshot">
            <Input
              id="edit-snapshot"
              name="snapshotDollars"
              type="number"
              min="0"
              step="0.01"
              defaultValue={dollars(pack.priceSnapshotCents)}
              key={`${pack.slug}-snapshot`}
            />
          </Field>
          <Field label="Update pass price (USD)" htmlFor="edit-update">
            <Input
              id="edit-update"
              name="updatePassDollars"
              type="number"
              min="0"
              step="0.01"
              defaultValue={dollars(pack.priceUpdatePassCents)}
              key={`${pack.slug}-update`}
            />
          </Field>
          <div className="md:col-span-2">
            <Field label="Changelog" htmlFor="edit-changelog">
              <Textarea id="edit-changelog" name="changelog" defaultValue={pack.changelog} key={`${pack.slug}-changelog`} />
            </Field>
          </div>
          <div className="flex flex-wrap gap-3 md:col-span-2">
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save pack'}
            </Button>
            <Button type="button" variant="outline" asChild>
              <Link to={`/packs/${pack.slug}`}>View public listing</Link>
            </Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={onDeletePack}>
              Delete pack
            </Button>
          </div>
        </form>
      </Card>

      <Card className="space-y-4">
        <h2 className="font-display text-2xl">Pack archive</h2>
        <p className="text-sm text-muted">Upload the zip buyers download for this version.</p>
        <form className="flex flex-wrap items-end gap-3" onSubmit={onUploadArchive}>
          <Field label="Zip file" htmlFor="pack-archive">
            <Input id="pack-archive" name="archive" type="file" accept=".zip,application/zip" />
          </Field>
          <Button type="submit" variant="outline" disabled={busy}>
            Upload archive
          </Button>
        </form>
      </Card>

      <section className="space-y-4">
        <h2 className="font-display text-2xl">Tracks</h2>
        <Card>
          <form className="grid gap-4 md:grid-cols-2" onSubmit={onAddTrack}>
            <Field label="Track name" htmlFor="track-name">
              <Input id="track-name" name="name" required />
            </Field>
            <Field label="Duration (seconds)" htmlFor="track-duration">
              <Input id="track-duration" name="durationSeconds" type="number" min={1} required />
            </Field>
            <Field label="Moods" htmlFor="track-moods">
              <Input id="track-moods" name="moods" placeholder="calm, tense" />
            </Field>
            <Field label="Instruments" htmlFor="track-instruments">
              <Input id="track-instruments" name="instruments" placeholder="lute, strings" />
            </Field>
            <div>
              <Button type="submit" disabled={busy}>
                Add track
              </Button>
            </div>
          </form>
        </Card>
        {pack.tracks.length === 0 ? <p className="text-muted">No tracks in this version yet.</p> : null}
        <ul className="divide-y divide-line">
          {pack.tracks.map((track) => (
            <li key={track.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="font-medium">{track.name}</p>
                <p className="text-xs text-muted">
                  {track.durationSeconds}s · {track.moods.join(', ') || 'no moods'} ·{' '}
                  {track.instruments.join(', ') || 'no instruments'} ·{' '}
                  {track.hasFullAudio ? 'audio uploaded' : 'no audio yet'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs text-muted">
                  Audio
                  <Input
                    type="file"
                    accept=".ogg,.wav,.flac,.mp3,.opus,audio/*"
                    className="mt-1 h-auto py-1"
                    aria-label={`Upload audio for ${track.name}`}
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0]
                      void onUploadAudio(track.id, file)
                      event.currentTarget.value = ''
                    }}
                  />
                </label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label={`Remove ${track.name}`}
                  disabled={busy}
                  onClick={() => onRemoveTrack(track.id, track.name)}
                >
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </article>
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
