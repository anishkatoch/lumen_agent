import { AgentState } from '../hooks/useWebSocket'

interface Props {
  state: AgentState
}

const BAR_COUNT = 20

export default function Waveform({ state }: Props) {
  const active = state === 'LISTENING' || state === 'SPEAKING'

  return (
    <div style={styles.container} aria-hidden>
      {Array.from({ length: BAR_COUNT }).map((_, i) => (
        <div
          key={i}
          style={{
            ...styles.bar,
            animationDelay: `${(i * 0.05) % 0.8}s`,
            animationPlayState: active ? 'running' : 'paused',
            background: state === 'SPEAKING' ? 'var(--accent)' : 'var(--border-strong)',
            opacity: active ? 1 : 0.3,
          }}
        />
      ))}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex', alignItems: 'center', gap: 3,
    height: 40, padding: '0 4px',
  },
  bar: {
    width: 3, height: '100%',
    borderRadius: 2,
    animation: 'waveform 0.8s ease-in-out infinite alternate',
    transformOrigin: 'bottom',
    transition: 'background 0.3s ease',
  },
}
