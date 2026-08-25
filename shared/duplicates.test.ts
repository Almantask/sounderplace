import { describe, expect, it } from 'vitest'
import { findExactDuplicate, shouldAutoRejectDuplicate } from './duplicates.ts'

describe('duplicate policy', () => {
  it('matches catalog-wide exact hashes case-insensitively', () => {
    expect(findExactDuplicate(['AbC'], 'abc')).toBe('AbC')
    expect(findExactDuplicate(['aaa'], 'bbb')).toBeNull()
  })

  it('auto-rejects exact or fingerprint hits, flags high CLAP similarity for review', () => {
    expect(shouldAutoRejectDuplicate({ exactHashHit: true, chromaprintHit: false, clapCosine: 0.2 })).toBe('reject')
    expect(shouldAutoRejectDuplicate({ exactHashHit: false, chromaprintHit: true, clapCosine: 0.2 })).toBe('reject')
    expect(shouldAutoRejectDuplicate({ exactHashHit: false, chromaprintHit: false, clapCosine: 0.97 })).toBe('review')
    expect(shouldAutoRejectDuplicate({ exactHashHit: false, chromaprintHit: false, clapCosine: 0.4 })).toBe('ok')
  })
})
