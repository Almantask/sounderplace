import { buildSeedStatements } from '../../shared/seed-statements.ts'

export { buildSeedStatements }

/**
 * Memoised per isolate. Seeding is a one-time concern, but ensureSeed sits in front of
 * nearly every read path, so without this the catalogue pays a `SELECT COUNT(*)` on every
 * request just to learn that seeding already happened. A failure clears the cache so the
 * next request retries.
 */
let seeding: Promise<void> | null = null

async function seedOnce(db: D1Database): Promise<void> {
  const existing = await db.prepare('SELECT COUNT(*) as count FROM packs').first<{ count: number }>()
  if ((existing?.count ?? 0) > 0) return
  const statements = buildSeedStatements().map((row) => db.prepare(row.sql).bind(...row.params))
  const chunkSize = 50
  for (let i = 0; i < statements.length; i += chunkSize) {
    await db.batch(statements.slice(i, i + chunkSize))
  }
}

export function ensureSeed(db: D1Database): Promise<void> {
  seeding ??= seedOnce(db).catch((error: unknown) => {
    seeding = null
    throw error
  })
  return seeding
}

/** Test hook: forgets that this isolate already seeded. */
export function resetSeedCache(): void {
  seeding = null
}
