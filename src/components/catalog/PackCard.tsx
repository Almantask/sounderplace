import { Link } from 'react-router-dom'
import { formatUsd, isFreePack } from '@shared/pricing'
import type { PackSummary } from '@shared/types'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'

export function PackCard({ pack }: { pack: PackSummary & { moods?: string[]; instruments?: string[] } }) {
  const free = isFreePack(pack.priceSnapshotCents, pack.priceUpdatePassCents)
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-gold">{pack.kind}</p>
          <h3 className="font-display mt-1 text-2xl">
            <Link to={`/packs/${pack.slug}`} className="hover:text-gold-bright">
              {pack.title}
            </Link>
          </h3>
        </div>
        <Badge>{free ? 'Free' : formatUsd(pack.priceSnapshotCents)}</Badge>
      </div>
      <p className="mt-3 text-sm text-muted">{pack.description}</p>
      <p className="mt-4 text-xs text-muted">
        {pack.trackCount} tracks · {pack.category} · v{pack.currentVersion.replace(/^v/, '')}
      </p>
    </Card>
  )
}
