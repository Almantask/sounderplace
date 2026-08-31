import { execFile } from 'node:child_process'
import { mkdir, open, readdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { promisify } from 'node:util'
import {
  buildDemoLibrary,
  renderDemoLibraryModule,
  wavDurationFromHeader,
  type ScannedFile,
} from './lib/demo-library.ts'

const run = promisify(execFile)

const { values } = parseArgs({
  options: {
    dir: { type: 'string' },
    out: { type: 'string', default: 'shared/demo-library.generated.ts' },
    staging: { type: 'string', default: 'demo-output' },
    bucket: { type: 'string', default: 'sunderplace-audio' },
    'skip-upload': { type: 'boolean', default: false },
    'skip-encode': { type: 'boolean', default: false },
  },
})

if (!values.dir) {
  console.error('Usage: npm run demo:build -- --dir "E:/Music-And-Fx-Generated-Library" [--skip-upload]')
  process.exit(1)
}

const root = path.resolve(values.dir)
const stagingDir = path.resolve(values.staging ?? 'demo-output')

/** Live packs that demo the paid flows: snapshot, update pass, and the upgrade delta. */
const PAID_PACKS: Record<string, [number, number]> = {
  'beast-hunt-ii': [900, 1400],
  'beast-hunt-iii': [1200, 1800],
}

const AUDIO_EXTENSIONS = new Set(['.wav'])
const IGNORED_DIRS = new Set(['.tmp.driveupload'])

async function scan(dir: string, segments: string[] = []): Promise<ScannedFile[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const files: ScannedFile[] = []
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (IGNORED_DIRS.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await scan(full, [...segments, entry.name])))
      continue
    }
    const extension = path.extname(entry.name).toLowerCase()
    if (!AUDIO_EXTENSIONS.has(extension)) continue
    const duration = await readWavDuration(full)
    if (duration === null) {
      console.warn(`  ! skipping unreadable header: ${path.relative(root, full)}`)
      continue
    }
    files.push({
      dirSegments: segments,
      baseName: path.basename(entry.name, extension),
      extension,
      durationSeconds: duration,
      sourcePath: full,
    })
  }
  return files
}

async function readWavDuration(filePath: string): Promise<number | null> {
  const handle = await open(filePath, 'r')
  try {
    const header = new Uint8Array(8192)
    const { bytesRead } = await handle.read(header, 0, header.length, 0)
    const { size } = await handle.stat()
    return wavDurationFromHeader(header.subarray(0, bytesRead), size)
  } finally {
    await handle.close()
  }
}

async function encodePreview(sourcePath: string, destination: string): Promise<void> {
  await mkdir(path.dirname(destination), { recursive: true })
  await run('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-i', sourcePath,
    '-vn', '-c:a', 'libvorbis', '-q:a', '4', '-ac', '2', '-ar', '44100',
    destination,
  ])
}

/**
 * Runs wrangler's JS entrypoint under the current Node binary. Spawning the `npx`
 * shim instead fails with EINVAL on Windows, where it resolves to a `.cmd` file that
 * Node refuses to spawn without a shell — and a shell would need every key and path
 * quoted by hand.
 */
async function uploadObject(key: string, filePath: string): Promise<void> {
  const wranglerBin = path.join(path.dirname(fileURLToPath(import.meta.resolve('wrangler/package.json'))), 'bin', 'wrangler.js')
  await run(
    process.execPath,
    [wranglerBin, 'r2', 'object', 'put', `${values.bucket}/${key}`, '--file', filePath, '--content-type', 'audio/ogg', '--local'],
    { cwd: process.cwd() },
  )
}

console.log(`Scanning ${root} …`)
await stat(root)
const files = await scan(root)
console.log(`Found ${files.length} audio files.`)

const { packs, previews, skipped } = buildDemoLibrary(files, { paid: PAID_PACKS })
if (skipped.length > 0) console.warn(`Skipped ${skipped.length} file(s) that did not match the render naming convention.`)

const live = packs.filter((pack) => pack.listingStatus === 'live')
console.log(`\nBuilt ${packs.length} packs (${live.length} live, ${packs.length - live.length} unlisted):`)
for (const pack of packs) {
  const price = pack.priceSnapshotCents === 0 ? 'free' : `$${(pack.priceSnapshotCents / 100).toFixed(2)}`
  console.log(
    `  ${pack.listingStatus.padEnd(15)} ${String(pack.tracks.length).padStart(3)} tracks  ${pack.slug} (${price})`,
  )
}

await writeFile(path.resolve(values.out ?? 'shared/demo-library.generated.ts'), renderDemoLibraryModule(packs, path.basename(root)))
console.log(`\nWrote ${values.out}`)

if (values['skip-encode']) {
  console.log('Skipping preview encode (--skip-encode).')
} else {
  console.log(`\nEncoding ${previews.length} preview(s) with ffmpeg …`)
  for (const preview of previews) {
    const destination = path.join(stagingDir, preview.key)
    await encodePreview(preview.sourcePath, destination)
    const { size } = await stat(destination)
    console.log(`  ${preview.packSlug}: ${(size / 1024).toFixed(0)} KB → ${preview.key}`)
  }
}

if (values['skip-upload']) {
  console.log('Skipping R2 upload (--skip-upload).')
} else {
  console.log(`\nUploading ${previews.length} preview(s) to local R2 bucket "${values.bucket}" …`)
  for (const preview of previews) {
    await uploadObject(preview.key, path.join(stagingDir, preview.key))
    console.log(`  put ${preview.key}`)
  }
}

console.log('\nDone. Reset local D1 to reseed: npm run demo:reset')
