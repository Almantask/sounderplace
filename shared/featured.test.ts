import { describe, expect, it } from 'vitest'
import { featuredScore, rankFeaturedPacks } from './featured.ts'

describe('featured ranking', () => {
  const now = new Date('2026-08-25T12:00:00Z')

  it('counts unique users in the rolling window, not raw download volume', () => {
    const activities = [
      { packId: 'a', userId: 'u1', at: new Date('2026-08-20T00:00:00Z') },
      { packId: 'a', userId: 'u1', at: new Date('2026-08-21T00:00:00Z') },
      { packId: 'a', userId: 'u2', at: new Date('2026-08-22T00:00:00Z') },
      { packId: 'a', userId: 'u3', at: new Date('2026-07-01T00:00:00Z') },
    ]
    expect(featuredScore('a', activities, now)).toBe(2)
  })

  it('ranks eligible packs by unique activity and ignores ineligible packs', () => {
    const packs = [
      { id: 'quiet', featuredEligible: true },
      { id: 'hot', featuredEligible: true },
      { id: 'hidden', featuredEligible: false },
    ]
    const activities = [
      { packId: 'hot', userId: 'u1', at: now },
      { packId: 'hot', userId: 'u2', at: now },
      { packId: 'quiet', userId: 'u1', at: now },
      { packId: 'hidden', userId: 'u1', at: now },
      { packId: 'hidden', userId: 'u2', at: now },
      { packId: 'hidden', userId: 'u3', at: now },
    ]
    expect(rankFeaturedPacks(packs, activities, now, 6)).toEqual(['hot', 'quiet'])
  })
})
