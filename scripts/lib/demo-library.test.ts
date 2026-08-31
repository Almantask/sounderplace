import { describe, expect, it } from 'vitest'
import {
  buildDemoLibrary,
  deriveTags,
  packIdentity,
  parseTrackFilename,
  repairMojibake,
  shortSetLabel,
  trackTitleFromSlug,
  wavDurationFromHeader,
  type ScannedFile,
} from './demo-library.ts'

function wavHeader(options: { sampleRate: number; channels: number; bits: number; dataBytes: number }): Uint8Array {
  const byteRate = options.sampleRate * options.channels * (options.bits / 8)
  const buffer = new ArrayBuffer(44)
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) bytes[offset + i] = text.charCodeAt(i)
  }
  ascii(0, 'RIFF')
  view.setUint32(4, 36 + options.dataBytes, true)
  ascii(8, 'WAVE')
  ascii(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, options.channels, true)
  view.setUint32(24, options.sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, options.channels * (options.bits / 8), true)
  view.setUint16(34, options.bits, true)
  ascii(36, 'data')
  view.setUint32(40, options.dataBytes, true)
  return bytes
}

function scanned(dirSegments: string[], baseName: string, durationSeconds = 60): ScannedFile {
  return {
    dirSegments,
    baseName,
    extension: '.wav',
    durationSeconds,
    sourcePath: `E:/lib/${dirSegments.join('/')}/${baseName}.wav`,
  }
}

describe('repairMojibake', () => {
  it('restores an em dash stored as cp1252-misread UTF-8', () => {
    expect(repairMojibake('Level I \u00e2\u20ac\u201d Quiet looping bed')).toBe('Level I — Quiet looping bed')
  })

  it('leaves clean names untouched', () => {
    expect(repairMojibake('Axe & Blunt')).toBe('Axe & Blunt')
    expect(repairMojibake('Level I — Full intensity')).toBe('Level I — Full intensity')
  })
})

describe('parseTrackFilename', () => {
  it('splits the prompt slug, requested duration, and render hash', () => {
    expect(parseTrackFilename('heavy-iron-axe-cutting-1.5s-ec66d1cb')).toEqual({
      promptSlug: 'heavy-iron-axe-cutting',
      statedSeconds: 1.5,
      renderHash: 'ec66d1cb',
    })
  })

  it('rejects names that do not follow the render convention', () => {
    expect(parseTrackFilename('some-random-file')).toBeNull()
    expect(parseTrackFilename('missing-hash-30s')).toBeNull()
  })
})

describe('wavDurationFromHeader', () => {
  it('reads byteRate from the fmt chunk rather than sampleRate', () => {
    // 44100 Hz stereo 16-bit: byteRate is 176400, sampleRate 44100. Reading the wrong
    // field inflates every duration exactly 4x, which is how this was caught.
    const dataBytes = 176_400 * 120
    const duration = wavDurationFromHeader(wavHeader({ sampleRate: 44_100, channels: 2, bits: 16, dataBytes }), 44 + dataBytes)
    expect(duration).toBeCloseTo(120, 5)
  })

  it('falls back to the real tail size when the data length is a placeholder', () => {
    const header = wavHeader({ sampleRate: 44_100, channels: 2, bits: 16, dataBytes: 0 })
    expect(wavDurationFromHeader(header, 44 + 176_400 * 10)).toBeCloseTo(10, 5)
  })

  it('returns null for non-WAVE input', () => {
    expect(wavDurationFromHeader(new Uint8Array(64), 64)).toBeNull()
  })
})

describe('trackTitleFromSlug', () => {
  it('keeps short prompts intact', () => {
    expect(trackTitleFromSlug('clean-ui-confirm-chime')).toBe('Clean UI Confirm Chime')
    expect(trackTitleFromSlug('winter-snowing')).toBe('Winter Snowing')
  })

  it('drops the word fragment left by truncation along with stranded stopwords', () => {
    expect(trackTitleFromSlug('instrumental-beast-hunt-ambient-serene-and-timel')).toBe(
      'Instrumental Beast Hunt Ambient Serene',
    )
    expect(trackTitleFromSlug('epic-orchestral-discovery-awe-struck-and-monumen')).toBe(
      'Epic Orchestral Discovery Awe Struck',
    )
  })

  it('drops stranded bare numbers', () => {
    expect(trackTitleFromSlug('cavern-ceiling-drips-into-a-pool-1-drop-per-10-s')).toBe(
      'Cavern Ceiling Drips into a Pool 1 Drop',
    )
  })
})

describe('deriveTags', () => {
  it('maps prompt words onto curated mood and instrument tags', () => {
    expect(deriveTags('instrumental-dark-orchestral-tension-ominous-and')).toEqual({
      moods: ['dark', 'tense', 'ominous'],
      instruments: ['orchestra'],
    })
  })

  it('returns empty lists when nothing in the prompt is recognised', () => {
    expect(deriveTags('agents-everywhere')).toEqual({ moods: [], instruments: [] })
  })
})

describe('shortSetLabel', () => {
  it('keeps the level and drops the descriptive half', () => {
    expect(shortSetLabel('Level I \u00e2\u20ac\u201d Quiet looping bed')).toBe('Level I')
    expect(shortSetLabel('Axe & Blunt')).toBe('Axe & Blunt')
  })
})

describe('packIdentity', () => {
  it('derives kind, slug, and title from the folder tree', () => {
    expect(packIdentity(['music', 'Beast Hunt', 'I'])).toMatchObject({
      slug: 'beast-hunt-i',
      title: 'Beast Hunt I',
      category: 'beast-hunt',
      kind: 'ambience',
    })
  })

  it('namespaces fx packs and folds a "General" set into the category', () => {
    expect(packIdentity(['sfx', 'Custom', 'General'])).toMatchObject({
      slug: 'fx-custom',
      title: 'Custom FX',
      kind: 'fx',
    })
    expect(packIdentity(['sfx', 'Combat', 'Axe & Blunt'])).toMatchObject({
      slug: 'fx-combat-axe-blunt',
      kind: 'fx',
    })
  })

  it('keeps a numbered set distinct from a same-numbered level set', () => {
    expect(packIdentity(['music', 'Beast Hunt', 'I']).slug).toBe('beast-hunt-i')
    expect(packIdentity(['music', 'Beast Hunt', 'Level I \u00e2\u20ac\u201d Quiet looping bed']).slug).toBe(
      'beast-hunt-level-i',
    )
  })
})

describe('buildDemoLibrary', () => {
  const thirty = Array.from({ length: 30 }, (_, i) =>
    scanned(['music', 'Beast Hunt', 'I'], `instrumental-beast-hunt-ambient-serene-and-timel-${100 + i}s-aabbcc0${i % 10}`),
  )

  it('lists a pack only once it meets the 30-track policy', () => {
    const { packs } = buildDemoLibrary([
      ...thirty,
      scanned(['ambience', 'Dungeon', 'General'], 'cavern-ceiling-drips-into-a-pool-large-cave-reve-380s-484f8916'),
    ])
    expect(packs.find((p) => p.slug === 'beast-hunt-i')?.listingStatus).toBe('live')
    expect(packs.find((p) => p.slug === 'dungeon')?.listingStatus).toBe('draft')
  })

  it('queues mid-sized packs for review instead of hiding them', () => {
    const twelve = Array.from({ length: 12 }, (_, i) =>
      scanned(['music', 'Custom', 'Demo'], `instrumental-patronage-ambient-generous-and-wron-270s-49de89${i.toString().padStart(2, '0')}`),
    )
    expect(buildDemoLibrary(twelve).packs[0].listingStatus).toBe('pending_review')
  })

  it('publishes exactly one preview per live pack and none for unlisted packs', () => {
    const { packs, previews } = buildDemoLibrary([
      ...thirty,
      scanned(['ambience', 'Dungeon', 'General'], 'cavern-ceiling-drips-into-a-pool-large-cave-reve-380s-484f8916'),
    ])
    expect(previews).toHaveLength(1)
    expect(previews[0]).toMatchObject({ packSlug: 'beast-hunt-i', trackId: 'track_beast-hunt-i_01' })
    const live = packs.find((p) => p.slug === 'beast-hunt-i')!
    expect(live.tracks.filter((t) => t.previewKey !== null)).toHaveLength(1)
    expect(live.tracks[0].previewKey).toBe('packs/beast-hunt-i/v/v1/tracks/track_beast-hunt-i_01.ogg')
    expect(packs.find((p) => p.slug === 'dungeon')!.tracks.every((t) => t.previewKey === null)).toBe(true)
  })

  it('never claims audio is ingested for tracks it did not upload', () => {
    const { packs } = buildDemoLibrary(thirty)
    expect(packs[0].tracks.every((track) => track.fullKey === null)).toBe(true)
  })

  it('disambiguates repeated prompts within a pack', () => {
    const names = buildDemoLibrary(thirty).packs[0].tracks.map((track) => track.name)
    expect(names[0]).toBe('Instrumental Beast Hunt Ambient Serene')
    expect(names[1]).toBe('Instrumental Beast Hunt Ambient Serene (2)')
    expect(new Set(names).size).toBe(names.length)
  })

  it('applies the configured paid pricing to matching slugs only', () => {
    const { packs } = buildDemoLibrary(thirty, { paid: { 'beast-hunt-i': [900, 1400] } })
    expect(packs[0]).toMatchObject({ priceSnapshotCents: 900, priceUpdatePassCents: 1400 })
  })

  it('reports files that do not match the render naming convention', () => {
    const { packs, skipped } = buildDemoLibrary([scanned(['music', 'Boss', 'I'], 'notes')])
    expect(packs).toHaveLength(0)
    expect(skipped).toEqual(['music/Boss/I/notes.wav'])
  })

  it('rounds durations to whole seconds with a one-second floor', () => {
    const { packs } = buildDemoLibrary([scanned(['sfx', 'Custom', 'General'], 'clean-ui-confirm-chime-1s-1c0496f7', 0.4)])
    expect(packs[0].tracks[0].durationSeconds).toBe(1)
  })
})
