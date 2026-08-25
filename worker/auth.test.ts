import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from './auth.ts'

describe('password hashing', () => {
  it('verifies a PBKDF2 hash created for the same password', async () => {
    const stored = await hashPassword('correct horse')
    expect(await verifyPassword('correct horse', stored)).toBe(true)
    expect(await verifyPassword('wrong', stored)).toBe(false)
  })
})
