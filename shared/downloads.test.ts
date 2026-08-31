import { describe, expect, it } from 'vitest'
import { downloadCountLabel, formatDownloadCount } from './downloads.ts'

describe('formatDownloadCount', () => {
  it('groups thousands', () => {
    expect(formatDownloadCount(1234)).toBe('1,234')
  })

  it('floors negative and non-finite counts to zero', () => {
    expect(formatDownloadCount(-5)).toBe('0')
    expect(formatDownloadCount(Number.NaN)).toBe('0')
  })
})

describe('downloadCountLabel', () => {
  it('reads naturally for zero, one, and many', () => {
    expect(downloadCountLabel(0)).toBe('No downloads yet')
    expect(downloadCountLabel(1)).toBe('1 download')
    expect(downloadCountLabel(2048)).toBe('2,048 downloads')
  })
})
