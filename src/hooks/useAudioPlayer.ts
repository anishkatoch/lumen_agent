import { useCallback, useRef } from 'react'

/**
 * Collects streaming MP3 chunks, then plays the full audio when the stream ends.
 * Simple and reliable — avoids MediaSource complexity and autoplay issues.
 */
export function useAudioPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const chunksRef = useRef<Uint8Array[]>([])

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
      audioRef.current = null
    }
    chunksRef.current = []
  }, [])

  const start = useCallback(() => {
    stop()
    chunksRef.current = []
  }, [stop])

  const appendChunk = useCallback((chunk: Uint8Array) => {
    chunksRef.current.push(chunk)
  }, [])

  const endStream = useCallback(() => {
    const chunks = chunksRef.current
    if (!chunks.length) {
      console.warn('[Audio] endStream called but no chunks buffered')
      return
    }

    const blob = new Blob(chunks, { type: 'audio/mpeg' })
    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)
    audioRef.current = audio

    audio.onended = () => {
      URL.revokeObjectURL(url)
      audioRef.current = null
    }

    audio.play()
      .then(() => console.log('[Audio] Playing TTS audio'))
      .catch(e => console.error('[Audio] Play failed:', e))

    chunksRef.current = []
  }, [])

  return { start, stop, appendChunk, endStream }
}
