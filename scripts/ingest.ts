import { parseArgs } from 'node:util'
import { readFile } from 'node:fs/promises'
import { ingestPack } from './lib/ingest.ts'

const { values } = parseArgs({
  options: {
    dir: { type: 'string' },
    slug: { type: 'string' },
    title: { type: 'string' },
    kind: { type: 'string' },
    category: { type: 'string' },
    version: { type: 'string', default: 'v1' },
    out: { type: 'string', default: 'ingest-output' },
    csv: { type: 'string' },
    hashes: { type: 'string' },
    moods: { type: 'string' },
    instruments: { type: 'string' },
    'snapshot-cents': { type: 'string', default: '0' },
    'update-pass-cents': { type: 'string', default: '0' },
  },
})

if (!values.dir || !values.slug || !values.title || !values.kind || !values.category) {
  console.error(
    'Usage: npm run ingest -- --dir ./pack --slug tavern-ambience --title Tavern --kind ambience --category tavern [--csv results.csv] [--hashes hashes.txt]',
  )
  process.exit(1)
}

if (values.kind !== 'ambience' && values.kind !== 'fx') {
  console.error('--kind must be ambience or fx')
  process.exit(1)
}

const catalogHashes = values.hashes ? (await readFile(values.hashes, 'utf8')).split(/\s+/).filter(Boolean) : []

const manifest = await ingestPack({
  dir: values.dir,
  slug: values.slug,
  title: values.title,
  kind: values.kind,
  category: values.category,
  version: values.version ?? 'v1',
  outDir: values.out ?? 'ingest-output',
  csvPath: values.csv,
  catalogHashes,
  moods: values.moods?.split(',').map((item) => item.trim()).filter(Boolean),
  instruments: values.instruments?.split(',').map((item) => item.trim()).filter(Boolean),
  snapshotCents: Number(values['snapshot-cents'] ?? 0),
  updatePassCents: Number(values['update-pass-cents'] ?? 0),
})

console.log(`Ingested ${manifest.tracks.length} tracks for ${manifest.slug}@${manifest.version}`)
console.log(`Wrote ${values.out}/pack.json and pack.zip`)
console.log('Upload pack.zip and track objects to R2 using the keys in r2-keys.txt, then apply D1 rows from pack.json.')
