import { describe, expect, it } from 'vitest'
import { parseFeedback } from './feedback.ts'

describe('parseFeedback', () => {
  it('accepts a message with optional contact details', () => {
    const result = parseFeedback({
      name: ' Ada ',
      email: ' ada@example.com ',
      category: 'idea',
      message: '  Please add more tavern beds.  ',
    })

    expect(result).toEqual({
      ok: true,
      value: {
        name: 'Ada',
        email: 'ada@example.com',
        category: 'idea',
        message: 'Please add more tavern beds.',
      },
    })
  })

  it('defaults category to other when omitted', () => {
    const result = parseFeedback({ message: 'The catalog filters are hard to use.' })
    expect(result).toEqual({
      ok: true,
      value: {
        name: null,
        email: null,
        category: 'other',
        message: 'The catalog filters are hard to use.',
      },
    })
  })

  it('rejects a missing or too-short message', () => {
    expect(parseFeedback({}).ok).toBe(false)
    expect(parseFeedback({ message: '   short   ' }).ok).toBe(false)
    expect(parseFeedback({ message: 'too short' }).ok).toBe(false)
  })

  it('rejects an invalid email when one is provided', () => {
    const result = parseFeedback({
      email: 'not-an-email',
      message: 'This is long enough to send.',
    })
    expect(result).toEqual({ ok: false, error: 'Enter a valid email or leave it blank' })
  })

  it('rejects an unknown category', () => {
    const result = parseFeedback({
      category: 'spam',
      message: 'This is long enough to send.',
    })
    expect(result).toEqual({ ok: false, error: 'Choose a valid feedback category' })
  })
})
