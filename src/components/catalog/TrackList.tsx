import type { TrackSummary } from '@shared/types'
import { PreviewPlayer } from './PreviewPlayer'

export function TrackList({ tracks }: { tracks: TrackSummary[] }) {
  if (tracks.length === 0) {
    return <p className="text-muted">No tracks in this version yet.</p>
  }
  return (
    <ul className="divide-y divide-line">
      {tracks.map((track) => (
        <li key={track.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div>
            <p className="font-medium">{track.name}</p>
            <p className="text-xs text-muted">
              {track.durationSeconds}s · {track.moods.join(', ')} · {track.instruments.join(', ')}
            </p>
          </div>
          <PreviewPlayer name={track.name} src={track.previewUrl} />
        </li>
      ))}
    </ul>
  )
}
