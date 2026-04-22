import { useEffect, useRef } from 'react'

export interface Message {
  role: 'user' | 'assistant'
  content: string
  id: string
}

interface Props {
  messages: Message[]
}

export default function ChatHistory({ messages }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  if (!messages.length) {
    return (
      <div style={styles.empty}>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, fontFamily: 'var(--font-mono)' }}>
          // conversation will appear here
        </p>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      {messages.map((msg, i) => (
        <div
          key={msg.id}
          style={{
            ...styles.msgWrapper,
            justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
            animationDelay: `${i * 0.03}s`,
          }}
          className="animate-fade-up"
        >
          {msg.role === 'assistant' && (
            <div style={styles.avatar}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="9" />
                <path d="M8 12a4 4 0 0 0 8 0" />
              </svg>
            </div>
          )}
          <div style={{
            ...styles.bubble,
            ...(msg.role === 'user' ? styles.userBubble : styles.aiBubble),
          }}>
            {msg.content}
          </div>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1, overflowY: 'auto', padding: '16px 20px',
    display: 'flex', flexDirection: 'column', gap: 12,
  },
  empty: {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  msgWrapper: {
    display: 'flex', alignItems: 'flex-end', gap: 8,
  },
  avatar: {
    width: 26, height: 26, borderRadius: '50%',
    background: 'var(--accent-dim)', border: '1px solid var(--accent-glow)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  bubble: {
    maxWidth: '75%', padding: '10px 14px', borderRadius: 14,
    fontSize: 14, lineHeight: 1.55, fontWeight: 400,
  },
  userBubble: {
    background: 'var(--accent)', color: '#0a0a0b',
    borderBottomRightRadius: 4,
    fontWeight: 500,
  },
  aiBubble: {
    background: 'var(--bg-elevated)', color: 'var(--text-primary)',
    border: '1px solid var(--border)',
    borderBottomLeftRadius: 4,
  },
}
