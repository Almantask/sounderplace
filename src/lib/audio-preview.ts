import { useSyncExternalStore } from 'react'

let activeAudio: HTMLAudioElement | null = null
let currentSrc: string | null = null
let isPlaying = false
const listeners = new Set<() => void>()

function notify() {
  listeners.forEach((l) => l())
}

export function togglePreview(src: string) {
  if (currentSrc === src && activeAudio) {
    if (isPlaying) {
      activeAudio.pause()
      activeAudio.currentTime = 0
      isPlaying = false
      notify()
      return
    } else {
      activeAudio
        .play()
        .then(() => {
          isPlaying = true
          notify()
        })
        .catch(() => {
          isPlaying = false
          notify()
        })
      return
    }
  }

  // Stop any currently playing audio so playing one stops another
  if (activeAudio) {
    activeAudio.pause()
    activeAudio.currentTime = 0
    activeAudio.removeAttribute('src')
  }

  if (typeof Audio !== 'undefined') {
    const audio = new Audio(src)
    activeAudio = audio
    currentSrc = src

    audio.onended = () => {
      if (activeAudio === audio) {
        isPlaying = false
        notify()
      }
    }

    audio.onpause = () => {
      if (activeAudio === audio) {
        isPlaying = false
        notify()
      }
    }

    audio.onplay = () => {
      if (activeAudio === audio) {
        isPlaying = true
        notify()
      }
    }

    audio.onerror = () => {
      if (activeAudio === audio) {
        isPlaying = false
        notify()
      }
    }

    audio
      .play()
      .then(() => {
        isPlaying = true
        notify()
      })
      .catch(() => {
        isPlaying = false
        notify()
      })
  } else {
    currentSrc = src
    isPlaying = true
    notify()
  }
}

export function stopAllPreviews() {
  if (activeAudio) {
    activeAudio.pause()
    activeAudio.currentTime = 0
  }
  activeAudio = null
  currentSrc = null
  isPlaying = false
  notify()
}

export function useIsPlayingPreview(src: string | null): boolean {
  return useSyncExternalStore(
    (callback) => {
      listeners.add(callback)
      return () => listeners.delete(callback)
    },
    () => Boolean(src && currentSrc === src && isPlaying),
    () => false,
  )
}
