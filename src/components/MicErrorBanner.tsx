import { MicError } from '../hooks/useMic'

interface Props {
  error: MicError
  onDismiss: () => void
}

const ERROR_INFO: Record<NonNullable<MicError>, { title: string; body: string }> = {
  blocked: {
    title: 'Microphone access blocked',
    body: 'Click the lock icon in your browser address bar and allow microphone access, then refresh the page.',
  },
  not_found: {
    title: 'No microphone detected',
    body: 'Plug in a microphone or headset, then try again.',
  },
  in_use: {
    title: 'Microphone is in use',
    body: 'Another app is using your microphone. Close it (e.g. Zoom, Meet) and try again.',
  },
  unknown: {
    title: 'Microphone error',
    body: 'Something went wrong accessing your microphone. Try refreshing the page.',
  },
}

export default function MicErrorBanner({ error, onDismiss }: Props) {
  if (!error) return null
  const { title, body } = ERROR_INFO[error]

  return (
    <div style={styles.banner} className="animate-fade-up">
      <div style={styles.icon}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <div style={styles.text}>
        <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>{title}</strong>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 }}>{body}</p>
      </div>
      <button onClick={onDismiss} style={styles.close} aria-label="Dismiss">✕</button>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  banner: {
    display: 'flex', alignItems: 'flex-start', gap: 10,
    background: 'rgba(255,77,109,0.08)', border: '1px solid rgba(255,77,109,0.25)',
    borderRadius: 10, padding: '12px 14px', margin: '0 16px',
  },
  icon: { flexShrink: 0, paddingTop: 1 },
  text: { flex: 1 },
  close: {
    background: 'none', border: 'none', color: 'var(--text-muted)',
    cursor: 'pointer', fontSize: 13, padding: 2, flexShrink: 0,
  },
}
