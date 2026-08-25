export function PreviewPlayer({ name, src }: { name: string; src: string | null }) {
  if (!src) {
    return <p className="text-xs text-muted">Preview available after ingest</p>
  }
  return <audio controls preload="none" src={src} aria-label={`Preview ${name}`} className="h-8 max-w-xs" />
}
