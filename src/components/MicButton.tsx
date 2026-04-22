import { AgentState } from '../hooks/useWebSocket'

interface Props {
  agentState: AgentState
  connected: boolean
  active: boolean
  onClick: () => void
}

export default function MicButton({ agentState, connected, active, onClick }: Props) {
  const isListening = agentState === 'LISTENING' && active
  const isSpeaking = agentState === 'SPEAKING'
  const isProcessing = agentState === 'PROCESSING'

  const color = isListening
    ? 'var(--accent)'
    : isSpeaking
    ? 'var(--blue)'
    : 'var(--text-muted)'

  return (
    <button
      onClick={onClick}
      disabled={!connected || isProcessing}
      style={{
        ...styles.btn,
        borderColor: color,
        boxShadow: isListening || isSpeaking
          ? `0 0 0 1px ${color}, 0 0 40px rgba(232,255,71,0.15)`
          : 'none',
        cursor: connected && !isProcessing ? 'pointer' : 'not-allowed',
      }}
      aria-label={active ? 'Stop listening' : 'Start listening'}
    >
      {/* Pulse rings — shown when listening */}
      {isListening && (
        <>
          <span style={{ ...styles.ring, animationDelay: '0s' }} />
          <span style={{ ...styles.ring, animationDelay: '0.5s' }} />
        </>
      )}

      {/* Mic icon */}
      <svg
        width="28" height="28" viewBox="0 0 24 24" fill="none"
        stroke={isProcessing ? 'var(--text-muted)' : color}
        strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      >
        {isProcessing ? (
          /* Spinner dots when processing */
          <>
            <circle cx="12" cy="12" r="1" fill={color} />
            <circle cx="7" cy="12" r="1" fill={color} />
            <circle cx="17" cy="12" r="1" fill={color} />
          </>
        ) : (
          <>
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5 10a7 7 0 0 0 14 0" />
            <line x1="12" y1="19" x2="12" y2="22" />
            <line x1="8" y1="22" x2="16" y2="22" />
          </>
        )}
      </svg>
    </button>
  )
}

const styles: Record<string, React.CSSProperties> = {
  btn: {
    position: 'relative',
    width: 80, height: 80,
    borderRadius: '50%',
    background: 'var(--bg-elevated)',
    border: '1.5px solid',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'border-color 0.3s, box-shadow 0.3s, transform 0.15s',
    flexShrink: 0,
  },
  ring: {
    position: 'absolute', inset: -4,
    borderRadius: '50%',
    border: '1.5px solid var(--accent)',
    animation: 'pulse-ring 1.5s cubic-bezier(0.2, 0.6, 0.4, 1) infinite',
  },
}
