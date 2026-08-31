import { MIN_LIVE_TRACKS, slugify } from '../../shared/admin.ts'
import type { DemoPack, DemoTrack } from '../../shared/demo-library.ts'
import type { ListingStatus, PackKind } from '../../shared/types.ts'

/**
 * Turns a Thunder FX render library into demo catalogue rows.
 *
 * The library is a three-level tree — `<kind>/<category>/<set>/*.wav` — and every
 * file is named `<prompt-slug>-<duration>s-<hash>.wav`. The duration in the name is
 * the *requested* length, which is often longer than what the model returned, so
 * callers pass the real duration read from the container instead.
 */

/** Trailing tokens that read badly once a truncated prompt loses its last word. */
const TRAILING_STOPWORDS = new Set([
  'a', 'an', 'and', 'at', 'by', 'for', 'from', 'in', 'into', 'of', 'on',
  'or', 'per', 'the', 'then', 'to', 'with', 'without',
])

/** Words kept lowercase inside a title unless they lead it. */
const MINOR_WORDS = new Set([
  'a', 'an', 'and', 'at', 'by', 'for', 'from', 'in', 'into', 'of', 'on',
  'or', 'per', 'the', 'then', 'to', 'with',
])

const ALWAYS_UPPER = new Set(['ui', 'fx', 'ii', 'iii', 'iv'])

/**
 * The renderer truncates prompt slugs to 48 characters. Anything at or above this
 * length lost its tail, so the final token is a word fragment ("timel", "monumen").
 */
const TRUNCATED_SLUG_LENGTH = 46

const TRACK_FILENAME_RE = /^(.+)-(\d+(?:\.\d+)?)s-([0-9a-f]{8})$/

/** cp1252 code points that a UTF-8 → cp1252 misread produces, mapped back to their byte. */
const CP1252_TO_BYTE: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85,
  0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a,
  0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92,
  0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c,
  0x017e: 0x9e, 0x0178: 0x9f,
}

const MOOD_WORDS: Record<string, string> = {
  adventurous: 'adventurous', alert: 'alert', ambient: 'ambient', ancient: 'ancient',
  apocalyptic: 'apocalyptic', awe: 'awe-struck', blaring: 'blaring', bright: 'bright',
  climax: 'climactic', coiled: 'coiled', dark: 'dark', dread: 'dreadful',
  driving: 'driving', elegant: 'elegant', epic: 'epic', exposed: 'exposed',
  furious: 'furious', gentle: 'gentle', gently: 'gentle', grim: 'grim',
  heavy: 'heavy', hushed: 'hushed', intimate: 'intimate', massive: 'massive',
  monumental: 'monumental', mysterious: 'mysterious', ominous: 'ominous',
  patient: 'patient', prowling: 'prowling', quiet: 'quiet', reverence: 'reverent',
  roaring: 'roaring', seductive: 'seductive', serene: 'serene', slow: 'slow',
  stillness: 'still', sweeping: 'sweeping', tension: 'tense', thundering: 'thunderous',
  timeworn: 'timeworn', towering: 'towering', violently: 'violent', watchful: 'watchful',
  wonder: 'wonder',
}

const INSTRUMENT_WORDS: Record<string, string> = {
  axe: 'axe', bell: 'bells', bells: 'bells', boiling: 'liquid', bubbling: 'liquid',
  cavern: 'cave tone', chime: 'chimes', chitin: 'chitin', choir: 'choir',
  drips: 'water', drums: 'drums', flute: 'flute', harp: 'harp', horns: 'horns',
  iron: 'iron', lute: 'lute', orchestra: 'orchestra', orchestral: 'orchestra',
  percussion: 'percussion', piano: 'piano', potion: 'liquid', strings: 'strings',
  taiko: 'taiko', tones: 'tones', wood: 'wood',
}

/** Fallback tags per category slug, used when a prompt yields none of its own. */
const CATEGORY_DEFAULTS: Record<string, { moods: string[]; instruments: string[] }> = {
  'ancient-discovery': { moods: ['awe-struck', 'mysterious'], instruments: ['orchestra', 'strings'] },
  'beast-hunt': { moods: ['tense', 'driving'], instruments: ['orchestra', 'percussion'] },
  boss: { moods: ['ominous', 'dark'], instruments: ['orchestra', 'brass'] },
  city: { moods: ['monumental', 'sweeping'], instruments: ['orchestra'] },
  combat: { moods: ['impact', 'sharp'], instruments: ['iron', 'wood'] },
  creatures: { moods: ['visceral', 'sharp'], instruments: ['foley'] },
  custom: { moods: ['varied'], instruments: ['orchestra'] },
  dungeon: { moods: ['tense', 'dark'], instruments: ['cave tone', 'water'] },
  winter: { moods: ['quiet', 'still'], instruments: ['pads'] },
}

const KIND_DEFAULTS: Record<PackKind, { moods: string[]; instruments: string[] }> = {
  ambience: { moods: ['ambient'], instruments: ['orchestra'] },
  fx: { moods: ['impact'], instruments: ['foley'] },
}

export interface ScannedFile {
  /** Path segments below the library root, e.g. `['music', 'Beast Hunt', 'I']`. */
  dirSegments: string[]
  /** File name without its extension. */
  baseName: string
  /** File extension including the dot, e.g. `.wav`. */
  extension: string
  /** True duration read from the audio container. */
  durationSeconds: number
  /** Absolute path, carried through so the caller can encode previews. */
  sourcePath: string
}

export interface ParsedTrackFilename {
  promptSlug: string
  statedSeconds: number
  renderHash: string
}

/**
 * Repairs names whose UTF-8 bytes were stored after being read as cp1252,
 * e.g. `Level I â€” Quiet looping bed` → `Level I — Quiet looping bed`.
 * Returns the input unchanged when it does not round-trip cleanly.
 */
export function repairMojibake(input: string): string {
  if (!/[Â-Ãâ-ï]/.test(input)) return input
  const bytes: number[] = []
  for (const char of input) {
    const code = char.codePointAt(0) ?? 0
    if (code <= 0xff) bytes.push(code)
    else if (CP1252_TO_BYTE[code] !== undefined) bytes.push(CP1252_TO_BYTE[code])
    else return input
  }
  const decoded = new TextDecoder('utf-8').decode(new Uint8Array(bytes))
  return decoded.includes('�') ? input : decoded
}

export function parseTrackFilename(baseName: string): ParsedTrackFilename | null {
  const match = TRACK_FILENAME_RE.exec(baseName)
  if (!match) return null
  return { promptSlug: match[1], statedSeconds: Number(match[2]), renderHash: match[3] }
}

/**
 * Reads the true duration out of a RIFF/WAVE header. The renderer bakes the *requested*
 * length into the file name, and it disagrees with the delivered audio about half the
 * time (a 380s request commonly lands as 120s), so the container is the only source of
 * truth. Pass the leading bytes of the file plus its total size; returns null when the
 * header is not WAVE or the chunks do not fit in the slice provided.
 */
export function wavDurationFromHeader(header: Uint8Array, fileSize: number): number | null {
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength)
  const ascii = (offset: number) => String.fromCharCode(...header.subarray(offset, offset + 4))
  if (header.byteLength < 44 || ascii(0) !== 'RIFF' || ascii(8) !== 'WAVE') return null
  let offset = 12
  let byteRate = 0
  while (offset + 8 <= header.byteLength) {
    const id = ascii(offset)
    const length = view.getUint32(offset + 4, true)
    // fmt layout: +8 format, +10 channels, +12 sampleRate, +16 byteRate.
    if (id === 'fmt ' && offset + 20 <= header.byteLength) byteRate = view.getUint32(offset + 16, true)
    if (id === 'data') {
      if (byteRate <= 0) return null
      // Streamed WAVs sometimes carry a placeholder length; fall back to the real tail size.
      const dataLength = length > 0 && offset + 8 + length <= fileSize ? length : fileSize - offset - 8
      return dataLength > 0 ? dataLength / byteRate : null
    }
    offset += 8 + length + (length % 2)
  }
  return null
}

function titleCase(words: string[]): string {
  return words
    .map((word, index) => {
      if (ALWAYS_UPPER.has(word)) return word.toUpperCase()
      if (index > 0 && MINOR_WORDS.has(word)) return word
      return word.charAt(0).toUpperCase() + word.slice(1)
    })
    .join(' ')
}

/**
 * Builds a readable track title from a prompt slug, dropping the word fragment left
 * behind by truncation along with any stopwords or bare numbers it stranded.
 */
export function trackTitleFromSlug(promptSlug: string): string {
  let words = promptSlug.split('-').filter(Boolean)
  if (promptSlug.length >= TRUNCATED_SLUG_LENGTH && words.length > 2) {
    words = words.slice(0, -1)
    for (let dropped = 0; dropped < 3 && words.length > 2; dropped += 1) {
      const last = words[words.length - 1]
      if (!TRAILING_STOPWORDS.has(last) && !/^\d+(\.\d+)?$/.test(last)) break
      words = words.slice(0, -1)
    }
  }
  return titleCase(words)
}

export function deriveTags(promptSlug: string): { moods: string[]; instruments: string[] } {
  const moods: string[] = []
  const instruments: string[] = []
  for (const word of promptSlug.split('-')) {
    const mood = MOOD_WORDS[word]
    if (mood && !moods.includes(mood)) moods.push(mood)
    const instrument = INSTRUMENT_WORDS[word]
    if (instrument && !instruments.includes(instrument)) instruments.push(instrument)
  }
  return { moods: moods.slice(0, 4), instruments: instruments.slice(0, 3) }
}

/** Strips the descriptive half of a set folder: `Level I — Quiet looping bed` → `Level I`. */
export function shortSetLabel(setFolder: string): string {
  const [head] = repairMojibake(setFolder).split(/\s+[—–-]\s+/)
  return (head ?? setFolder).trim()
}

export interface PackIdentity {
  slug: string
  title: string
  category: string
  categoryLabel: string
  kind: PackKind
}

export function packIdentity(dirSegments: string[]): PackIdentity {
  const [topFolder = '', categoryFolder = '', setFolder = ''] = dirSegments
  const kind: PackKind = topFolder.toLowerCase() === 'sfx' ? 'fx' : 'ambience'
  const categoryLabel = repairMojibake(categoryFolder).trim()
  const setLabel = shortSetLabel(setFolder)
  const generic = setLabel.toLowerCase() === 'general' || setLabel === ''
  const slug = slugify([kind === 'fx' ? 'fx' : '', categoryLabel, generic ? '' : setLabel].filter(Boolean).join(' '))
  const titleParts = [categoryLabel, generic ? '' : setLabel].filter(Boolean)
  if (generic && kind === 'fx') titleParts.push('FX')
  return {
    slug,
    title: titleParts.join(' '),
    category: slugify(categoryLabel),
    categoryLabel,
    kind,
  }
}

function defaultsFor(identity: PackIdentity) {
  return CATEGORY_DEFAULTS[identity.category] ?? KIND_DEFAULTS[identity.kind]
}

function packDescription(identity: PackIdentity, trackCount: number, moods: string[]): string {
  const unit = identity.kind === 'fx' ? 'one-shots' : 'beds'
  const flavour = moods.length > 0 ? `${moods.slice(0, 3).join(', ')}` : 'hand-picked renders'
  return `${trackCount} ${identity.kind === 'fx' ? 'FX' : 'ambience'} ${unit} from the ${identity.categoryLabel} set — ${flavour}.`
}

/** Sub-30 packs are not listable, but the larger ones are worth queueing for review. */
function statusFor(trackCount: number): ListingStatus {
  if (trackCount >= MIN_LIVE_TRACKS) return 'live'
  if (trackCount >= 10) return 'pending_review'
  return 'draft'
}

export interface BuildDemoLibraryOptions {
  /** Pack slugs to price as paid listings, as `slug -> [snapshotCents, updatePassCents]`. */
  paid?: Record<string, [number, number]>
  version?: string
  /** Extension used for the encoded preview objects. */
  previewExtension?: string
}

export interface DemoLibraryBuild {
  packs: DemoPack[]
  /** Preview encodes the caller still has to produce, one per live pack. */
  previews: Array<{ packSlug: string; trackId: string; sourcePath: string; key: string }>
  skipped: string[]
}

export function buildDemoLibrary(files: ScannedFile[], options: BuildDemoLibraryOptions = {}): DemoLibraryBuild {
  const version = options.version ?? 'v1'
  const previewExtension = options.previewExtension ?? '.ogg'
  const paid = options.paid ?? {}
  const skipped: string[] = []

  const grouped = new Map<string, { identity: PackIdentity; files: ScannedFile[] }>()
  for (const file of files) {
    if (!parseTrackFilename(file.baseName)) {
      skipped.push(`${file.dirSegments.join('/')}/${file.baseName}${file.extension}`)
      continue
    }
    const identity = packIdentity(file.dirSegments)
    if (!identity.slug) {
      skipped.push(`${file.dirSegments.join('/')}/${file.baseName}${file.extension}`)
      continue
    }
    const group = grouped.get(identity.slug) ?? { identity, files: [] }
    group.files.push(file)
    grouped.set(identity.slug, group)
  }

  const packs: DemoPack[] = []
  const previews: DemoLibraryBuild['previews'] = []

  for (const [slug, group] of [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const { identity } = group
    const ordered = [...group.files].sort((a, b) => a.baseName.localeCompare(b.baseName))
    const status = statusFor(ordered.length)
    const fallback = defaultsFor(identity)
    const usedNames = new Map<string, number>()
    const packMoods = new Set<string>()

    const tracks: DemoTrack[] = ordered.map((file, index) => {
      const parsed = parseTrackFilename(file.baseName)!
      const derived = deriveTags(parsed.promptSlug)
      const moods = derived.moods.length > 0 ? derived.moods : fallback.moods
      const instruments = derived.instruments.length > 0 ? derived.instruments : fallback.instruments
      for (const mood of moods) packMoods.add(mood)

      const baseTitle = trackTitleFromSlug(parsed.promptSlug)
      const seen = usedNames.get(baseTitle) ?? 0
      usedNames.set(baseTitle, seen + 1)
      const name = seen === 0 ? baseTitle : `${baseTitle} (${seen + 1})`

      const trackId = `track_${slug}_${String(index + 1).padStart(2, '0')}`
      // Only the first track of a live pack is published as a preview, and only that
      // object is uploaded — everything else stays un-ingested until the operator CLI runs.
      const isPreview = status === 'live' && index === 0
      if (isPreview) {
        previews.push({
          packSlug: slug,
          trackId,
          sourcePath: file.sourcePath,
          key: `packs/${slug}/v/${version}/tracks/${trackId}${previewExtension}`,
        })
      }
      return {
        id: trackId,
        name,
        durationSeconds: Math.max(1, Math.round(file.durationSeconds)),
        sortOrder: index,
        moods,
        instruments,
        fullKey: null,
        previewKey: isPreview ? `packs/${slug}/v/${version}/tracks/${trackId}${previewExtension}` : null,
      }
    })

    const [snapshotCents, updatePassCents] = paid[slug] ?? [0, 0]
    packs.push({
      id: `pack_${slug}`,
      slug,
      title: identity.title,
      description: packDescription(identity, tracks.length, [...packMoods]),
      kind: identity.kind,
      category: identity.category,
      listingStatus: status,
      priceSnapshotCents: snapshotCents,
      priceUpdatePassCents: updatePassCents,
      featuredEligible: status === 'live',
      version,
      changelog: 'Initial curated release',
      zipKey: `packs/${slug}/v/${version}/pack.zip`,
      tracks,
    })
  }

  return { packs, previews, skipped }
}

export function renderDemoLibraryModule(packs: DemoPack[], sourceLabel: string): string {
  const generatedAt = new Date().toISOString().slice(0, 10)
  return `// Generated by \`npm run demo:build\` on ${generatedAt} from ${sourceLabel}.
// Do not edit by hand — rerun the script instead.
import type { DemoPack } from './demo-library.ts'

export const DEMO_PACKS: DemoPack[] = ${JSON.stringify(packs, null, 2)}
`
}
