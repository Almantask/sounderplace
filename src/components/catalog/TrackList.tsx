import type { TrackSummary } from '@shared/types'
import { Badge } from '@/components/ui/badge'
import { PreviewPlayer } from './PreviewPlayer'

export function TrackList({ tracks }: { tracks: TrackSummary[] }) {
  if (tracks.length === 0) {
    return <p className="text-muted">No tracks in this version yet.</p>
  }
  return (
    <ul className="divide-y divide-line">
      {tracks.map((track) => (
        <li key={track.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <p className="font-medium">{track.name}</p>
              {track.previewUrl ? <Badge className="bg-gold/10 text-[10px]">Full Preview</Badge> : null}
            </div>
            <p className="text-xs text-muted">
              {track.durationSeconds}s · {track.moods.join(', ')} · {track.instruments.join(', ')}
            </p>
          </div>
          {track.previewUrl ? (
            <PreviewPlayer name={track.name} src={track.previewUrl} />
          ) : (
            <span className="text-xs text-muted">Included in pack</span>
          )}
        </li>
      ))}
    </ul>
  )
}
