import { buildSeedStatements } from '../../shared/seed-statements.ts'

export { buildSeedStatements }

export async function ensureSeed(db: D1Database): Promise<void> {
  const existing = await db.prepare('SELECT COUNT(*) as count FROM packs').first<{ count: number }>()
  if ((existing?.count ?? 0) > 0) return
  const statements = buildSeedStatements(true).map((row) => db.prepare(row.sql).bind(...row.params))
  const chunkSize = 50
  for (let i = 0; i < statements.length; i += chunkSize) {
    await db.batch(statements.slice(i, i + chunkSize))
  }
}
