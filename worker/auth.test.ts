import { describe, expect, it } from 'vitest'
import {
  DUMMY_PASSWORD_HASH,
  hashPassword,
  signOAuthState,
  verifyOAuthState,
  verifyPassword,
  verifyPasswordOrDummy,
} from './auth.ts'

describe('password hashing', () => {
  it('verifies a PBKDF2 hash created for the same password', async () => {
    const stored = await hashPassword('correct horse')
    expect(await verifyPassword('correct horse', stored)).toBe(true)
    expect(await verifyPassword('wrong', stored)).toBe(false)
  })

  it('runs a dummy verify when the stored hash is missing so missing users are not cheaper', async () => {
    expect(await verifyPasswordOrDummy('correct horse', null)).toBe(false)
    expect(await verifyPassword('correct horse', DUMMY_PASSWORD_HASH)).toBe(false)
  })
})

describe('oauth state', () => {
  it('accepts a signed nonce that matches the query state', async () => {
    const { nonce, signed } = await signOAuthState('test-secret')
    expect(await verifyOAuthState('test-secret', nonce, signed)).toBe(true)
    expect(await verifyOAuthState('test-secret', crypto.randomUUID(), signed)).toBe(false)
    expect(await verifyOAuthState('test-secret', nonce, null)).toBe(false)
    expect(await verifyOAuthState('other-secret', nonce, signed)).toBe(false)
  })
})
