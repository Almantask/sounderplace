import { drizzle } from 'drizzle-orm/d1'
import type { Env } from './env.ts'
import * as schema from '../drizzle/schema.ts'

export function createDb(env: Env) {
  return drizzle(env.DB, { schema })
}

export type AppDb = ReturnType<typeof createDb>
