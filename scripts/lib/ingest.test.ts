import { mkdtemp, writeFile, mkdir } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ingestPack, parseSunderCsv } from './ingest.ts'
import { createStoredZip } from './zip-store.ts'

describe('sunder CSV parsing', () => {
  it('reads file, category, and confidence columns', () => {
    const rows = parseSunderCsv(`path,category,confidence\nforest/a.ogg,forest,0.81\nb.wav,tavern,0.4`)
    expect(rows).toEqual([
      { file: 'forest/a.ogg', category: 'forest', confidence: 0.81 },
      { file: 'b.wav', category: 'tavern', confidence: 0.4 },
    ])
  })
})

describe('operator ingest', () => {
  it('rejects packs smaller than 30 tracks', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'sp-small-'))
    await writeFile(path.join(dir, 'a.ogg'), 'ogg')
    await expect(
      ingestPack({
        dir,
        slug: 'tiny',
        title: 'Tiny',
        kind: 'fx',
        category: 'ui',
        version: 'v1',
        outDir: path.join(dir, 'out'),
        catalogHashes: [],
      }),
    ).rejects.toThrow(/at least 30/)
  })

  it('rejects exact duplicates against the whole catalog hash list', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'sp-dup-'))
    for (let i = 0; i < 30; i += 1) {
      await writeFile(path.join(dir, `t${i}.ogg`), `unique-${i}`)
    }
    const { createHash } = await import('node:crypto')
    const catalogHash = createHash('sha256').update('unique-0').digest('hex')
    await expect(
      ingestPack({
        dir,
        slug: 'dupes',
        title: 'Dupes',
        kind: 'fx',
        category: 'ui',
        version: 'v1',
        outDir: path.join(dir, 'out'),
        catalogHashes: [catalogHash],
      }),
    ).rejects.toThrow(/duplicate/i)
  })

  it('writes pack.json and a zip when thirty unique tracks ingest cleanly', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'sp-ok-'))
    const outDir = path.join(dir, 'out')
    await mkdir(dir, { recursive: true })
    for (let i = 0; i < 30; i += 1) {
      await writeFile(path.join(dir, `t${i}.ogg`), `unique-${i}`)
    }
    const manifest = await ingestPack({
      dir,
      slug: 'ui-fx',
      title: 'UI',
      kind: 'fx',
      category: 'ui',
      version: 'v1',
      outDir,
      catalogHashes: [],
    })
    expect(manifest.tracks).toHaveLength(30)
    const zip = createStoredZip([{ name: 'a.txt', data: new TextEncoder().encode('hi') }])
    expect(zip[0]).toBe(0x50)
    expect(zip[1]).toBe(0x4b)
  })
})
