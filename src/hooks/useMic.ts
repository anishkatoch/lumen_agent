import { useState, useCallback, useRef } from 'react'

export type MicError = 'blocked' | 'not_found' | 'in_use' | 'unknown' | null

export interface MicState {
  stream: MediaStream | null
  error: MicError
  requesting: boolean
}

export function useMic() {
  const [state, setState] = useState<MicState>({ stream: null, error: null, requesting: false })
  const streamRef = useRef<MediaStream | null>(null)

  const requestMic = useCallback(async (): Promise<MediaStream | null> => {
    setState(s => ({ ...s, requesting: true, error: null }))
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      })
      streamRef.current = stream
      setState({ stream, error: null, requesting: false })
      return stream
    } catch (err: unknown) {
      let error: MicError = 'unknown'
      if (err instanceof DOMException) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') error = 'blocked'
        else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') error = 'not_found'
        else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') error = 'in_use'
      }
      setState({ stream: null, error, requesting: false })
      return null
    }
  }, [])

  const releaseMic = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    setState({ stream: null, error: null, requesting: false })
  }, [])

  return { ...state, requestMic, releaseMic }
}
