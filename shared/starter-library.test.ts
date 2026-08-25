import { STARTER_PACKS, STARTER_TRACK_COUNT, trackName } from './starter-library.ts'
import { describe, expect, it } from 'vitest'

describe('starter library', () => {
  it('defines ten themed packs of thirty tracks: five ambience and five fx', () => {
    expect(STARTER_PACKS).toHaveLength(10)
    expect(STARTER_PACKS.filter((pack) => pack.kind === 'ambience')).toHaveLength(5)
    expect(STARTER_PACKS.filter((pack) => pack.kind === 'fx')).toHaveLength(5)
    expect(STARTER_PACKS.every((pack) => pack.trackCount === STARTER_TRACK_COUNT)).toBe(true)
  })

  it('names tracks with a stable padded index', () => {
    expect(trackName('Tavern', 0)).toBe('Tavern 01')
    expect(trackName('Tavern', 29)).toBe('Tavern 30')
  })
})
