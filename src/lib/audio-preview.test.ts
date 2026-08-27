import { describe, expect, it, vi, beforeEach } from 'vitest'
import { togglePreview, stopAllPreviews } from './audio-preview'

describe('audio-preview manager', () => {
  beforeEach(() => {
    stopAllPreviews()
  })

  it('toggles playback and manages single-audio playback', () => {
    // Mock Audio
    const playMock = vi.fn().mockResolvedValue(undefined)
    const pauseMock = vi.fn()

    class MockAudio {
      src: string
      currentTime = 0
      play = playMock
      pause = pauseMock
      removeAttribute = vi.fn()
      constructor(src: string) {
        this.src = src
      }
    }

    vi.stubGlobal('Audio', MockAudio)

    togglePreview('/api/previews/track_01')
    expect(playMock).toHaveBeenCalled()

    // Playing another track stops the first
    togglePreview('/api/previews/track_02')
    expect(pauseMock).toHaveBeenCalled()

    vi.unstubAllGlobals()
  })
})
