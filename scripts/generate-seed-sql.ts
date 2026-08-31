import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { buildSeedStatements } from '../shared/seed-statements.ts'

const { values } = parseArgs({
  options: { out: { type: 'string', default: '.seed-output/seed.sql' } },
})

// Deliberately not written into migrations/: the demo catalogue is applied at runtime by
// ensureSeed, and dropping a second file into the migrations directory would collide with
// the numbering there. This dump is for inspection and for priming a remote D1 by hand.
const outPath = path.resolve(values.out ?? '.seed-output/seed.sql')
const statements = buildSeedStatements()
const sql = statements
  .map((row) => {
    const params = [...row.params]
    const bound = row.sql.replace(/\?/g, () => {
      const value = params.shift()
      if (value === null || value === undefined) return 'NULL'
      if (typeof value === 'number') return String(value)
      return `'${String(value).replaceAll("'", "''")}'`
    })
    return `${bound};`
  })
  .join('\n')

await mkdir(path.dirname(outPath), { recursive: true })
await writeFile(outPath, `-- generated demo catalogue\n${sql}\n`)
console.log(`Wrote ${outPath} (${statements.length} statements)`)
