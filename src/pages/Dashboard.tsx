import { useState, useCallback, useRef, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useWebSocket, WSMessage } from '../hooks/useWebSocket'
import { useMic } from '../hooks/useMic'
import { useAudioPlayer } from '../hooks/useAudioPlayer'
import MicButton from '../components/MicButton'
import Waveform from '../components/Waveform'
import ChatHistory, { Message } from '../components/ChatHistory'
import MicErrorBanner from '../components/MicErrorBanner'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8001'

interface Conversation {
  id: string
  title: string
  created_at: string
}

export default function Dashboard() {
  const { user, accessToken, signOut } = useAuth()
  const [messages, setMessages] = useState<Message[]>([])
  const [micActive, setMicActive] = useState(false)
  const [statusText, setStatusText] = useState('Click the mic to start')
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(false)

  const audioPlayer = useAudioPlayer()
  const audioContextRef = useRef<AudioContext | null>(null)
  const workletNodeRef = useRef<AudioWorkletNode | null>(null)

  // ── Mic ────────────────────────────────────────────────────────────
  const { stream, error: micError, requestMic, releaseMic } = useMic()

  // ── WebSocket ──────────────────────────────────────────────────────
  const handleMessage = useCallback((msg: WSMessage) => {
    if (msg.type === 'transcript' && msg.text) {
      setMessages(prev => [...prev, { role: 'user', content: msg.text!, id: crypto.randomUUID() }])
    }
    if (msg.type === 'reply' && msg.text) {
      setMessages(prev => [...prev, { role: 'assistant', content: msg.text!, id: crypto.randomUUID() }])
      console.log('[Audio] reply received, starting audio player')
      audioPlayer.start()
    }
    if (msg.type === 'error' && msg.message) {
      setStatusText(msg.message)
    }
    if (msg.type === 'audio_end') {
      console.log('[Audio] audio_end received, calling endStream')
      audioPlayer.endStream()
    }
    if (msg.type === 'state' && msg.state) {
      const labels: Record<string, string> = {
        LISTENING: 'Listening…',
        PROCESSING: 'Thinking…',
        SPEAKING: 'Speaking…',
        DISCONNECTED: 'Disconnected',
      }
      setStatusText(labels[msg.state] ?? msg.state)
    }
  }, [audioPlayer])

  const handleAudioChunk = useCallback((chunk: Uint8Array) => {
    console.log('[Audio] chunk received:', chunk.byteLength, 'bytes')
    audioPlayer.appendChunk(chunk)
  }, [audioPlayer])

  const handleStopAudio = useCallback(() => {
    audioPlayer.stop()
  }, [audioPlayer])

  const { agentState, connected, conversationId, sendAudio, sendControl } = useWebSocket({
    token: accessToken,
    onMessage: handleMessage,
    onAudioChunk: handleAudioChunk,
    onStopAudio: handleStopAudio,
  })

  // Status label when disconnected
  useEffect(() => {
    if (!connected) setStatusText('Connecting…')
    else if (!micActive) setStatusText('Click the mic to start')
  }, [connected, micActive])

  // ── Audio capture: AudioWorklet → raw int16 PCM → WebSocket ────────
  const startCapture = useCallback(async (micStream: MediaStream) => {
    const ctx = new AudioContext({ sampleRate: 16000 })
    audioContextRef.current = ctx
    console.log('[Audio] AudioContext sampleRate:', ctx.sampleRate)

    await ctx.audioWorklet.addModule('/audio-processor.js')
    const source = ctx.createMediaStreamSource(micStream)
    const worklet = new AudioWorkletNode(ctx, 'audio-processor')

    worklet.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
      sendAudio(e.data)
    }

    source.connect(worklet)
    worklet.connect(ctx.destination)
    workletNodeRef.current = worklet

    // Send actual sample rate to backend
    sendControl({ type: 'sample_rate', value: ctx.sampleRate })
  }, [sendAudio, sendControl])

  const stopCapture = useCallback(() => {
    workletNodeRef.current?.disconnect()
    workletNodeRef.current = null
    audioContextRef.current?.close()
    audioContextRef.current = null
  }, [])

  // ── Mic toggle ────────────────────────────────────────────────────
  const toggleMic = useCallback(async () => {
    if (micActive) {
      stopCapture()
      releaseMic()
      setMicActive(false)
      setStatusText('Click the mic to start')
      return
    }

    const micStream = await requestMic()
    if (!micStream) return // error shown via MicErrorBanner

    setMicActive(true)
    await startCapture(micStream)
  }, [micActive, requestMic, releaseMic, startCapture, stopCapture])

  // ── Conversation history sidebar ───────────────────────────────────
  const loadConversations = useCallback(async () => {
    if (!accessToken) return
    setLoadingHistory(true)
    try {
      const res = await fetch(`${API}/api/conversations`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (res.ok) setConversations(await res.json())
    } finally {
      setLoadingHistory(false)
    }
  }, [accessToken])

  const loadConversationMessages = useCallback(async (convId: string) => {
    if (!accessToken) return
    const res = await fetch(`${API}/api/conversations/${convId}/messages`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (res.ok) {
      const data = await res.json()
      setMessages(data.map((m: { role: string; content: string }) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
        id: crypto.randomUUID(),
      })))
      setSidebarOpen(false)
    }
  }, [accessToken])

  // ── Sensitivity slider ─────────────────────────────────────────────
  const [sensitivity, setSensitivity] = useState(0.5)
  const handleSensitivity = (v: number) => {
    setSensitivity(v)
    sendControl({ type: 'set_sensitivity', value: v })
  }

  return (
    <div style={styles.root}>
      {/* ── Sidebar ───────────────────────────────────────────────── */}
      {sidebarOpen && (
        <div style={styles.sidebarOverlay} onClick={() => setSidebarOpen(false)} />
      )}
      <aside style={{ ...styles.sidebar, transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)' }}>
        <div style={styles.sidebarHeader}>
          <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.06em', color: 'var(--text-secondary)' }}>
            HISTORY
          </span>
          <button onClick={() => setSidebarOpen(false)} style={styles.iconBtn}>✕</button>
        </div>
        {loadingHistory ? (
          <div style={{ padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>
        ) : conversations.length === 0 ? (
          <div style={{ padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>No previous sessions</div>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {conversations.map(conv => (
              <button
                key={conv.id}
                onClick={() => loadConversationMessages(conv.id)}
                style={styles.convItem}
              >
                <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{conv.title}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  {new Date(conv.created_at).toLocaleDateString()}
                </span>
              </button>
            ))}
          </div>
        )}
      </aside>

      {/* ── Main panel ───────────────────────────────────────────────── */}
      <main style={styles.main}>
        {/* Top bar */}
        <header style={styles.topBar}>
          <div style={styles.topLeft}>
            <button
              onClick={() => { setSidebarOpen(true); loadConversations() }}
              style={styles.iconBtn}
              aria-label="Open history"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>

            <div style={styles.logoMark}>
              <svg width="20" height="20" viewBox="0 0 28 28" fill="none">
                <circle cx="14" cy="14" r="13" stroke="var(--accent)" strokeWidth="1.5" />
                <path d="M9 14c0-2.76 2.24-5 5-5s5 2.24 5 5" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" />
                <circle cx="14" cy="14" r="2.5" fill="var(--accent)" />
              </svg>
            </div>
            <span style={styles.brandName}>Voice Agent</span>
          </div>

          <div style={styles.topRight}>
            <span style={styles.userChip}>
              {user?.full_name || user?.email?.split('@')[0]}
            </span>
            <button onClick={signOut} style={{ ...styles.iconBtn, color: 'var(--text-secondary)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </div>
        </header>

        {/* Connection badge */}
        <div style={styles.connBadge}>
          <div style={{
            ...styles.dot,
            background: connected ? 'var(--accent)' : 'var(--text-muted)',
            boxShadow: connected ? '0 0 6px var(--accent)' : 'none',
          }} />
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
            {connected ? `ws connected · ${conversationId?.slice(0, 8) ?? ''}` : 'connecting…'}
          </span>
        </div>

        {/* Mic error */}
        <MicErrorBanner error={micError} onDismiss={() => { /* errors self-clear on next attempt */ }} />

        {/* Chat */}
        <ChatHistory messages={messages} />

        {/* Controls */}
        <div style={styles.controls}>
          <Waveform state={micActive ? agentState : 'DISCONNECTED'} />

          <div style={styles.micCenter}>
            <span style={styles.statusText}>{statusText}</span>
            <MicButton
              agentState={micActive ? agentState : 'DISCONNECTED'}
              connected={connected}
              active={micActive}
              onClick={toggleMic}
            />
          </div>

          {/* Sensitivity slider */}
          <div style={styles.sliderWrap}>
            <span style={styles.sliderLabel}>Interrupt</span>
            <input
              type="range" min={0} max={1} step={0.05}
              value={sensitivity}
              onChange={e => handleSensitivity(parseFloat(e.target.value))}
              style={styles.slider}
            />
            <span style={styles.sliderLabel}>{sensitivity.toFixed(1)}</span>
          </div>
        </div>
      </main>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  root: { display: 'flex', height: '100vh', background: 'var(--bg)', overflow: 'hidden' },

  // Sidebar
  sidebarOverlay: {
    position: 'fixed', inset: 0, zIndex: 40,
    background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
  },
  sidebar: {
    position: 'fixed', left: 0, top: 0, bottom: 0, zIndex: 50,
    width: 280, background: 'var(--bg-surface)',
    borderRight: '1px solid var(--border)',
    display: 'flex', flexDirection: 'column',
    transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
  },
  sidebarHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '20px 16px', borderBottom: '1px solid var(--border)',
  },
  convItem: {
    display: 'flex', flexDirection: 'column', gap: 4,
    padding: '12px 16px', borderBottom: '1px solid var(--border)',
    background: 'none', border: 'none', width: '100%',
    textAlign: 'left', cursor: 'pointer',
    transition: 'background var(--transition)',
  },

  // Main
  main: { flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 },
  topBar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 20px', borderBottom: '1px solid var(--border)',
    flexShrink: 0,
  },
  topLeft: { display: 'flex', alignItems: 'center', gap: 12 },
  topRight: { display: 'flex', alignItems: 'center', gap: 10 },
  logoMark: { display: 'flex', alignItems: 'center' },
  brandName: { fontSize: 15, fontWeight: 700, letterSpacing: '-0.3px' },
  userChip: {
    fontSize: 12, color: 'var(--text-secondary)',
    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
    borderRadius: 6, padding: '4px 10px', fontFamily: 'var(--font-mono)',
  },
  iconBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    color: 'var(--text-primary)', display: 'flex', alignItems: 'center',
    padding: 6, borderRadius: 8, transition: 'background var(--transition)',
  },
  connBadge: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '8px 20px', borderBottom: '1px solid var(--border)',
    flexShrink: 0,
  },
  dot: { width: 7, height: 7, borderRadius: '50%', flexShrink: 0 },

  // Controls
  controls: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '20px 24px', borderTop: '1px solid var(--border)',
    flexShrink: 0, gap: 16,
  },
  micCenter: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, flexShrink: 0,
  },
  statusText: {
    fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)',
    letterSpacing: '0.03em', minHeight: 16,
  },
  sliderWrap: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
    minWidth: 80,
  },
  sliderLabel: {
    fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)',
    letterSpacing: '0.05em', textTransform: 'uppercase',
  },
  slider: { width: 72, accentColor: 'var(--accent)', cursor: 'pointer' },
}
