import { Link } from 'react-router-dom'
import { formatUsd, isFreePack } from '@shared/pricing'
import type { PackSummary } from '@shared/types'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { PreviewPlayer } from './PreviewPlayer'

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
      <div className="mt-4 flex items-center justify-between gap-3 rounded-md border border-line/60 bg-leather/40 p-3">
        <div>
          <p className="text-xs text-muted">
            Preview track: <strong className="text-ink">{pack.previewTrack?.name ?? `${pack.title} 01`}</strong>
          </p>
          <p className="text-[11px] text-muted">
            {pack.previewTrack?.durationSeconds ?? (pack.kind === 'fx' ? 3 : 90)}s · Full track
          </p>
        </div>
        <PreviewPlayer
          name={pack.previewTrack?.name ?? `${pack.title} 01`}
          src={pack.previewTrack?.previewUrl ?? `/api/previews/track_${pack.slug}_01`}
        />
      </div>
      <p className="mt-4 text-xs text-muted">
        {pack.trackCount} tracks · {pack.category} · v{pack.currentVersion.replace(/^v/, '')}
      </p>
    </Card>
  )
}
