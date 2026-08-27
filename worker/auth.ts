import type { Context } from 'hono'
import {
  bytesToHex,
  clipPassword,
  hexToBytes,
  sessionIsActive,
  SESSION_COOKIE_MAX_AGE_SEC,
  SESSION_MAX_AGE_MS,
  timingSafeEqualHex,
  timingSafeEqualString,
} from '../shared/security.ts'
import type { Env } from './env.ts'

const COOKIE = 'sp_session'
const OAUTH_COOKIE = 'sp_oauth'
const PBKDF2_ITERATIONS = 210_000
export const DUMMY_PASSWORD_HASH =
  'pbkdf2$210000$00000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000'

export interface AuthUser {
  id: string
  email: string
  name: string
  emailVerified: boolean
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
  const material = clipPassword(password)
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(material), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS },
    key,
    256,
  )
  return `pbkdf2$${PBKDF2_ITERATIONS}$${bytesToHex(salt)}$${bytesToHex(bits)}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const material = clipPassword(password)
  const [scheme, iter, saltHex, hashHex] = stored.split('$')
  const iterations = Number(iter)
  const salt = saltHex ? hexToBytes(saltHex) : null
  if (scheme !== 'pbkdf2' || !Number.isInteger(iterations) || iterations < 1 || iterations > 500_000 || !salt || !hashHex) {
    return verifyPassword(material, DUMMY_PASSWORD_HASH).then(() => false)
  }
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(material), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    256,
  )
  return timingSafeEqualHex(bytesToHex(bits), hashHex)
}

export async function verifyPasswordOrDummy(password: string, stored: string | null | undefined): Promise<boolean> {
  return verifyPassword(password, stored || DUMMY_PASSWORD_HASH)
}

export async function createSession(env: Env, userId: string, request: Request): Promise<string> {
  const id = crypto.randomUUID()
  const token = crypto.randomUUID()
  const now = Date.now()
  const expiresAt = now + SESSION_MAX_AGE_MS
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

function cookieParts(name: string, value: string, secure: boolean, maxAge: number): string {
  const parts = [`${name}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`]
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

export function sessionCookie(token: string, secure: boolean): string {
  return cookieParts(COOKIE, token, secure, SESSION_COOKIE_MAX_AGE_SEC)
}

export function clearSessionCookie(secure: boolean): string {
  return cookieParts(COOKIE, '', secure, 0)
}

export function oauthStateCookie(signed: string, secure: boolean): string {
  return cookieParts(OAUTH_COOKIE, signed, secure, 60 * 10)
}

export function clearOauthStateCookie(secure: boolean): string {
  return cookieParts(OAUTH_COOKIE, '', secure, 0)
}

function readNamedCookie(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie')
  if (!header) return null
  const match = header
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
  return match ? match.slice(name.length + 1) : null
}

export async function signOAuthState(secret: string): Promise<{ nonce: string; signed: string }> {
  const nonce = crypto.randomUUID()
  return { nonce, signed: `${nonce}.${await hmacSign(secret, nonce)}` }
}

export async function verifyOAuthState(secret: string, queryState: string | undefined, signedCookie: string | null): Promise<boolean> {
  if (!queryState || !signedCookie) return false
  const [nonce, sig] = signedCookie.split('.')
  if (!nonce || !sig) return false
  const expected = await hmacSign(secret, nonce)
  return timingSafeEqualString(expected, sig) && timingSafeEqualString(nonce, queryState)
}

export async function createOAuthState(env: Env): Promise<{ nonce: string; cookie: string; secure: boolean }> {
  const { nonce, signed } = await signOAuthState(env.SESSION_SECRET)
  const secure = env.APP_URL.startsWith('https://')
  return { nonce, cookie: oauthStateCookie(signed, secure), secure }
}

export function readOAuthStateCookie(request: Request): string | null {
  return readNamedCookie(request, OAUTH_COOKIE)
}

export async function getSessionUser(env: Env, request: Request): Promise<AuthUser | null> {
  const raw = readNamedCookie(request, COOKIE)
  if (!raw) return null
  const [token, sig] = raw.split('.')
  if (!token || !sig) return null
  const expected = await hmacSign(env.SESSION_SECRET, token)
  if (!timingSafeEqualString(expected, sig)) return null
  const row = await env.DB.prepare(
    `SELECT user.id as id, user.email as email, user.name as name, user.email_verified as email_verified,
            session.expires_at as expires_at, session.updated_at as updated_at
     FROM session JOIN user ON user.id = session.user_id
     WHERE session.token = ?`,
  )
    .bind(token)
    .first<{ id: string; email: string; name: string; email_verified: number; expires_at: number; updated_at: number }>()
  if (!row || !sessionIsActive({ expiresAt: row.expires_at, updatedAt: row.updated_at })) {
    if (row) await env.DB.prepare('DELETE FROM session WHERE token = ?').bind(token).run()
    return null
  }
  await env.DB.prepare('UPDATE session SET updated_at = ? WHERE token = ?').bind(Date.now(), token).run()
  return { id: row.id, email: row.email, name: row.name, emailVerified: Number(row.email_verified) === 1 }
}

export async function deleteSession(env: Env, request: Request, options: { all?: boolean } = {}): Promise<void> {
  const raw = readNamedCookie(request, COOKIE)
  if (!raw) return
  const [token, sig] = raw.split('.')
  if (!token || !sig) return
  const expected = await hmacSign(env.SESSION_SECRET, token)
  if (!timingSafeEqualString(expected, sig)) return
  if (options.all) {
    const row = await env.DB.prepare('SELECT user_id as userId FROM session WHERE token = ?')
      .bind(token)
      .first<{ userId: string }>()
    if (row) await env.DB.prepare('DELETE FROM session WHERE user_id = ?').bind(row.userId).run()
    return
  }
  await env.DB.prepare('DELETE FROM session WHERE token = ?').bind(token).run()
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
  const password = await hashPassword(input.password)
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)`,
    ).bind(id, input.name, input.email.toLowerCase(), now, now),
    env.DB.prepare(
      `INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at)
       VALUES (?, ?, 'credential', ?, ?, ?, ?)`,
    ).bind(crypto.randomUUID(), input.email.toLowerCase(), id, password, now, now),
  ])
  return { id, email: input.email.toLowerCase(), name: input.name, emailVerified: false }
}
