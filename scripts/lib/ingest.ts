import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { findExactDuplicate, shouldAutoRejectDuplicate } from '../../shared/duplicates.ts'
import { createStoredZip } from './zip-store.ts'

export const AUDIO_EXT = new Set(['.ogg', '.wav', '.flac', '.mp3', '.opus'])

export interface SunderCsvRow {
  file: string
  category?: string
  confidence?: number
}

export function parseSunderCsv(text: string): SunderCsvRow[] {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length === 0) return []
  const header = lines[0].split(',').map((cell) => cell.trim().toLowerCase())
  const fileIdx = header.findIndex((cell) => cell.includes('path') || cell.includes('file') || cell.includes('track'))
  const categoryIdx = header.findIndex((cell) => cell.includes('category') || cell.includes('sunder'))
  const confidenceIdx = header.findIndex((cell) => cell.includes('confidence'))
  const rows: SunderCsvRow[] = []
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue
    const cells = line.split(',').map((cell) => cell.trim().replace(/^"|"$/g, ''))
    const file = cells[fileIdx] ?? cells[0]
    rows.push({
      file,
      category: categoryIdx >= 0 ? cells[categoryIdx] : undefined,
      confidence: confidenceIdx >= 0 ? Number(cells[confidenceIdx]) : undefined,
    })
  }
  return rows
}

export async function listAudioFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await listAudioFiles(full)))
    } else if (AUDIO_EXT.has(path.extname(entry.name).toLowerCase())) {
      files.push(full)
    }
  }
  return files.sort()
}

export async function sha256File(filePath: string): Promise<string> {
  const data = await readFile(filePath)
  return createHash('sha256').update(data).digest('hex')
}

export interface IngestOptions {
  dir: string
  slug: string
  title: string
  kind: 'ambience' | 'fx'
  category: string
  version: string
  outDir: string
  catalogHashes: string[]
  minTracks?: number
  csvPath?: string
  moods?: string[]
  instruments?: string[]
  snapshotCents?: number
  updatePassCents?: number
}

export async function ingestPack(options: IngestOptions) {
  const minTracks = options.minTracks ?? 30
  const files = await listAudioFiles(options.dir)
  if (files.length < minTracks) {
    throw new Error(`Pack must contain at least ${minTracks} themed tracks (found ${files.length})`)
  }
  const csvRows = options.csvPath ? parseSunderCsv(await readFile(options.csvPath, 'utf8')) : []
  const tracks = []
  const rejected: string[] = []
  const seenHashes = [...options.catalogHashes]
  for (const filePath of files) {
    const hash = await sha256File(filePath)
    const exact = findExactDuplicate(seenHashes, hash)
    seenHashes.push(hash)
    const decision = shouldAutoRejectDuplicate({
      exactHashHit: Boolean(exact),
      chromaprintHit: false,
      clapCosine: null,
    })
    if (decision === 'reject') {
      rejected.push(filePath)
      continue
    }
    const base = path.basename(filePath)
    const csv = csvRows.find((row) => row.file.endsWith(base) || filePath.endsWith(row.file))
    tracks.push({
      filePath,
      name: path.parse(filePath).name,
      contentSha256: hash,
      category: csv?.category ?? options.category,
      moods: options.moods ?? [],
      instruments: options.instruments ?? [],
    })
  }
  if (rejected.length > 0) {
    throw new Error(`Rejected ${rejected.length} duplicate track(s) vs the catalog hash list`)
  }
  if (tracks.length < minTracks) {
    throw new Error(`After duplicate checks, pack has ${tracks.length} tracks; need ${minTracks}`)
  }

  const r2Prefix = `packs/${options.slug}/v/${options.version}`
  await mkdir(options.outDir, { recursive: true })
  const zipFiles: Array<{ name: string; data: Uint8Array }> = []
  const manifestTracks = []
  for (const [index, track] of tracks.entries()) {
    const data = new Uint8Array(await readFile(track.filePath))
    const trackId = `track_${options.slug}_${String(index + 1).padStart(2, '0')}`
    const rel = `${r2Prefix}/tracks/${trackId}${path.extname(track.filePath)}`
    zipFiles.push({ name: `${track.name}${path.extname(track.filePath)}`, data })
    manifestTracks.push({
      id: trackId,
      name: track.name,
      r2Key: rel,
      contentSha256: track.contentSha256,
      moods: track.moods,
      instruments: track.instruments,
    })
  }
  const packJson = {
    slug: options.slug,
    title: options.title,
    kind: options.kind,
    category: options.category,
    version: options.version,
    ownerType: 'platform',
    listingStatus: 'live',
    priceSnapshotCents: options.snapshotCents ?? 0,
    priceUpdatePassCents: options.updatePassCents ?? 0,
    tracks: manifestTracks,
    vectorize: 'skipped unless --vectorize is passed to a future GPU worker',
  }
  zipFiles.push({ name: 'pack.json', data: new TextEncoder().encode(JSON.stringify(packJson, null, 2)) })
  const zip = createStoredZip(zipFiles)
  await writeFile(path.join(options.outDir, 'pack.json'), JSON.stringify(packJson, null, 2))
  await writeFile(path.join(options.outDir, 'pack.zip'), zip)
  await writeFile(
    path.join(options.outDir, 'r2-keys.txt'),
    [`${r2Prefix}/pack.zip`, ...manifestTracks.map((track) => track.r2Key)].join('\n'),
  )
  return packJson
}
