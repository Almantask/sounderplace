import { Button } from '@/components/ui/button'
import { togglePreview, useIsPlayingPreview } from '@/lib/audio-preview'

export function PreviewPlayer({ name, src }: { name: string; src: string | null }) {
  const isPlaying = useIsPlayingPreview(src)

  if (!src) {
    return <span className="text-xs text-muted">Preview unavailable</span>
  }

  return (
    <Button
      type="button"
      variant={isPlaying ? 'default' : 'outline'}
      size="sm"
      onClick={() => togglePreview(src)}
      aria-label={isPlaying ? `Stop preview of ${name}` : `Preview ${name}`}
      className="shrink-0 font-medium"
    >
      {isPlaying ? (
        <>
          <svg className="h-3.5 w-3.5 fill-current" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="6" y="6" width="12" height="12" rx="1.5" />
          </svg>
          <span>Stop</span>
        </>
      ) : (
        <>
          <svg className="h-3.5 w-3.5 fill-current" viewBox="0 0 24 24" aria-hidden="true">
            <polygon points="6 4 20 12 6 20 6 4" />
          </svg>
          <span>Play</span>
        </>
      )}
    </Button>
  )
}
