import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { api } from '@/lib/api'

export function LibraryPage() {
  const [items, setItems] = useState<
    Array<{
      slug: string
      title: string
      kind: string
      currentVersion: string
      snapshotVersion: string
      license: string
    }>
  >([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .library()
      .then((data) => setItems(data.items))
      .catch((err: Error) => setError(err.message))
  }, [])

  if (error) {
    return (
      <p role="alert">
        {error}. <span className="text-muted">Sign in from the header to keep your library.</span>
      </p>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="font-display text-4xl">Library</h1>
      <p className="text-muted">
        Snapshot licenses keep the version you bought. Update-pass licenses include later versions of the same pack.
      </p>
      <div className="grid gap-4">
        {items.map((item) => (
          <Card key={`${item.slug}-${item.license}`} className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <Link to={`/packs/${item.slug}`} className="font-display text-2xl hover:text-gold">
                {item.title}
              </Link>
              <p className="text-sm text-muted">
                {item.kind} · {item.license.replace('_', ' ')} · snapshot {item.snapshotVersion} · current{' '}
                {item.currentVersion}
              </p>
            </div>
            <Button variant="outline" asChild>
              <a href={`/api/downloads/${item.slug}/${item.license === 'update_pass' ? item.currentVersion : item.snapshotVersion}`}>
                Download
              </a>
            </Button>
          </Card>
        ))}
      </div>
    </div>
  )
}
