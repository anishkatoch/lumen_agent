import { useCallback, useEffect, useRef, useState } from 'react'

const WS_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8001')
  .replace(/^http/, 'ws')

export type AgentState = 'LISTENING' | 'PROCESSING' | 'SPEAKING' | 'DISCONNECTED'

export interface WSMessage {
  type: string
  text?: string
  state?: AgentState
  conversation_id?: string
  message?: string
}

interface UseWebSocketOptions {
  token: string | null
  onMessage?: (msg: WSMessage) => void
  onAudioChunk?: (chunk: Uint8Array) => void
  onStopAudio?: () => void
}

export function useWebSocket({ token, onMessage, onAudioChunk, onStopAudio }: UseWebSocketOptions) {
  const [agentState, setAgentState] = useState<AgentState>('DISCONNECTED')
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)

  const wsRef = useRef<WebSocket | null>(null)
  const retriesRef = useRef(0)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)

  // Keep callbacks in refs so they never cause connect() to recreate
  const onMessageRef = useRef(onMessage)
  const onAudioChunkRef = useRef(onAudioChunk)
  const onStopAudioRef = useRef(onStopAudio)
  useEffect(() => { onMessageRef.current = onMessage }, [onMessage])
  useEffect(() => { onAudioChunkRef.current = onAudioChunk }, [onAudioChunk])
  useEffect(() => { onStopAudioRef.current = onStopAudio }, [onStopAudio])

  const connect = useCallback(() => {
    if (!token || !mountedRef.current) return
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const ws = new WebSocket(`${WS_BASE}/ws/${token}`)
    ws.binaryType = 'arraybuffer'
    wsRef.current = ws

    ws.onopen = () => {
      if (!mountedRef.current) return
      retriesRef.current = 0
      setConnected(true)
      setAgentState('LISTENING')
    }

    ws.onmessage = (event) => {
      if (!mountedRef.current) return

      if (event.data instanceof ArrayBuffer) {
        onAudioChunkRef.current?.(new Uint8Array(event.data))
        return
      }

      try {
        const msg: WSMessage = JSON.parse(event.data as string)

        if (msg.type === 'state' && msg.state) setAgentState(msg.state)
        if (msg.type === 'ready' && msg.conversation_id) setConversationId(msg.conversation_id)
        if (msg.type === 'stop_audio') onStopAudioRef.current?.()

        onMessageRef.current?.(msg)
      } catch { /* ignore malformed */ }
    }

    ws.onclose = (event) => {
      if (!mountedRef.current) return
      setConnected(false)
      setAgentState('DISCONNECTED')

      if (event.code !== 1000 && event.code !== 4001 && event.code !== 1008) {
        const attempts = retriesRef.current
        if (attempts < 3) {
          const delay = Math.pow(2, attempts) * 1000
          retriesRef.current += 1
          retryTimerRef.current = setTimeout(connect, delay)
        }
      }
    }

    ws.onerror = () => { ws.close() }
  }, [token]) // only re-connect when token changes

  useEffect(() => {
    mountedRef.current = true
    connect()
    return () => {
      mountedRef.current = false
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
      wsRef.current?.close(1000)
    }
  }, [connect])

  const sendAudio = useCallback((pcmBytes: ArrayBuffer) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(pcmBytes)
    }
  }, [])

  const sendControl = useCallback((msg: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg))
    }
  }, [])

  return { agentState, connected, conversationId, sendAudio, sendControl }
}
