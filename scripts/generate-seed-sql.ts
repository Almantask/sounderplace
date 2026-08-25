import { writeFile } from 'node:fs/promises'
import { buildSeedStatements } from '../shared/seed-statements.ts'

const statements = buildSeedStatements(true)
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

await writeFile('migrations/0002_seed.sql', `-- generated starter library\n${sql}\n`)
console.log('Wrote migrations/0002_seed.sql')
