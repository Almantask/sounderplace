import type { Context } from 'hono'
import type { Env } from './env.ts'

const COOKIE = 'sp_session'
const PBKDF2_ITERATIONS = 100_000

export interface AuthUser {
  id: string
  email: string
  name: string
}

function bytesToHex(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  return [...view].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.length % 2 === 0 ? hex : `0${hex}`
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

async function hmacSign(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))
  return bytesToHex(sig)
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS },
    key,
    256,
  )
  return `pbkdf2$${PBKDF2_ITERATIONS}$${bytesToHex(salt)}$${bytesToHex(bits)}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iter, saltHex, hashHex] = stored.split('$')
  if (scheme !== 'pbkdf2' || !iter || !saltHex || !hashHex) return false
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: hexToBytes(saltHex), iterations: Number(iter) },
    key,
    256,
  )
  return bytesToHex(bits) === hashHex
}

export async function createSession(env: Env, userId: string, request: Request): Promise<string> {
  const id = crypto.randomUUID()
  const token = crypto.randomUUID()
  const now = Date.now()
  const expiresAt = now + 1000 * 60 * 60 * 24 * 30
  await env.DB.prepare(
    `INSERT INTO session (id, expires_at, token, created_at, updated_at, ip_address, user_agent, user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      expiresAt,
      token,
      now,
      now,
      request.headers.get('cf-connecting-ip'),
      request.headers.get('user-agent'),
      userId,
    )
    .run()
  const signed = `${token}.${await hmacSign(env.SESSION_SECRET, token)}`
  return signed
}

export function sessionCookie(token: string, secure: boolean): string {
  const parts = [
    `${COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${60 * 60 * 24 * 30}`,
  ]
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

export function clearSessionCookie(secure: boolean): string {
  const parts = [`${COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0']
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

function readCookie(request: Request): string | null {
  const header = request.headers.get('Cookie')
  if (!header) return null
  const match = header.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE}=`))
  return match ? match.slice(COOKIE.length + 1) : null
}

export async function getSessionUser(env: Env, request: Request): Promise<AuthUser | null> {
  const raw = readCookie(request)
  if (!raw) return null
  const [token, sig] = raw.split('.')
  if (!token || !sig) return null
  const expected = await hmacSign(env.SESSION_SECRET, token)
  if (expected !== sig) return null
  const row = await env.DB.prepare(
    `SELECT user.id as id, user.email as email, user.name as name, session.expires_at as expires_at
     FROM session JOIN user ON user.id = session.user_id
     WHERE session.token = ?`,
  )
    .bind(token)
    .first<{ id: string; email: string; name: string; expires_at: number }>()
  if (!row || row.expires_at < Date.now()) return null
  return { id: row.id, email: row.email, name: row.name }
}

export async function requireUser(c: Context<{ Bindings: Env }>): Promise<AuthUser> {
  const user = await getSessionUser(c.env, c.req.raw)
  if (!user) throw new Error('UNAUTHENTICATED')
  return user
}

export async function createUser(
  env: Env,
  input: { email: string; name: string; password: string },
): Promise<AuthUser> {
  const id = crypto.randomUUID()
  const now = Date.now()
  await env.DB.prepare(
    `INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)`,
  )
    .bind(id, input.name, input.email.toLowerCase(), now, now)
    .run()
  const password = await hashPassword(input.password)
  await env.DB.prepare(
    `INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at)
     VALUES (?, ?, 'credential', ?, ?, ?, ?)`,
  )
    .bind(crypto.randomUUID(), input.email.toLowerCase(), id, password, now, now)
    .run()
  return { id, email: input.email.toLowerCase(), name: input.name }
}
