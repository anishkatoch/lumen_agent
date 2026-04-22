import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

type Mode = 'signin' | 'signup'

export default function AuthPage() {
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const { signIn, signUp } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setLoading(true)
    try {
      if (mode === 'signin') {
        await signIn(email, password)
        navigate('/')
      } else {
        await signUp(email, password, fullName || undefined)
        navigate('/')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An error occurred'
      if (msg === 'confirmation_required') {
        setSuccess('Check your email to confirm your account, then sign in.')
      } else {
        setError(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.root}>
      {/* Background grid */}
      <div style={styles.grid} aria-hidden />

      <div style={styles.card} className="animate-fade-up">
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.logo}>
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <circle cx="14" cy="14" r="13" stroke="var(--accent)" strokeWidth="1.5" />
              <path d="M9 14c0-2.76 2.24-5 5-5s5 2.24 5 5" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="14" cy="14" r="2.5" fill="var(--accent)" />
            </svg>
          </div>
          <h1 style={styles.title}>Voice Agent</h1>
          <p style={styles.subtitle}>
            {mode === 'signin' ? 'Welcome back' : 'Create your account'}
          </p>
        </div>

        {/* Tabs */}
        <div style={styles.tabs}>
          <button
            style={{ ...styles.tab, ...(mode === 'signin' ? styles.tabActive : {}) }}
            onClick={() => { setMode('signin'); setError(null) }}
          >
            Sign in
          </button>
          <button
            style={{ ...styles.tab, ...(mode === 'signup' ? styles.tabActive : {}) }}
            onClick={() => { setMode('signup'); setError(null) }}
          >
            Sign up
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={styles.form}>
          {mode === 'signup' && (
            <Field
              label="Full name"
              type="text"
              value={fullName}
              onChange={setFullName}
              placeholder="Jane Doe"
              autoComplete="name"
            />
          )}
          <Field
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="you@example.com"
            autoComplete="email"
            required
          />
          <Field
            label="Password"
            type="password"
            value={password}
            onChange={setPassword}
            placeholder="••••••••"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            required
          />

          {error && (
            <div style={styles.error}>
              <span style={{ color: 'var(--red)', fontSize: 13 }}>{error}</span>
            </div>
          )}
          {success && (
            <div style={{ background: 'rgba(0,200,100,0.08)', border: '1px solid rgba(0,200,100,0.2)', borderRadius: 8, padding: '10px 14px' }}>
              <span style={{ color: '#00c864', fontSize: 13 }}>{success}</span>
            </div>
          )}

          <button type="submit" style={styles.submitBtn} disabled={loading}>
            {loading ? <Spinner /> : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        {mode === 'signup' && (
          <p style={styles.note}>
            A confirmation email will be sent to verify your address.
          </p>
        )}
      </div>
    </div>
  )
}

function Field({
  label, type, value, onChange, placeholder, autoComplete, required,
}: {
  label: string; type: string; value: string;
  onChange: (v: string) => void; placeholder?: string;
  autoComplete?: string; required?: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={styles.label}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        style={styles.input}
        onFocus={e => Object.assign(e.target.style, focusStyle)}
        onBlur={e => Object.assign(e.target.style, blurStyle)}
      />
    </div>
  )
}

function Spinner() {
  return (
    <div style={{
      width: 18, height: 18, border: '2px solid rgba(0,0,0,0.3)',
      borderTopColor: '#000', borderRadius: '50%',
      animation: 'spin 0.7s linear infinite', margin: '0 auto',
    }} />
  )
}

const focusStyle = { borderColor: 'var(--accent)', outline: 'none', boxShadow: '0 0 0 3px var(--accent-dim)' }
const blurStyle = { borderColor: 'var(--border-strong)', boxShadow: 'none' }

const styles: Record<string, React.CSSProperties> = {
  root: {
    height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--bg)', position: 'relative', overflow: 'hidden',
  },
  grid: {
    position: 'absolute', inset: 0,
    backgroundImage: 'linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)',
    backgroundSize: '40px 40px',
    maskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, black 40%, transparent 100%)',
  },
  card: {
    position: 'relative', zIndex: 1, width: '100%', maxWidth: 400,
    background: 'var(--bg-surface)', border: '1px solid var(--border-strong)',
    borderRadius: 'var(--radius-lg)', padding: '40px 36px',
    boxShadow: '0 40px 80px rgba(0,0,0,0.5)',
  },
  header: { textAlign: 'center', marginBottom: 28 },
  logo: { display: 'flex', justifyContent: 'center', marginBottom: 16 },
  title: { fontSize: 24, fontWeight: 700, letterSpacing: '-0.5px', marginBottom: 6 },
  subtitle: { fontSize: 14, color: 'var(--text-secondary)', fontWeight: 400 },
  tabs: {
    display: 'grid', gridTemplateColumns: '1fr 1fr',
    background: 'var(--bg-elevated)', borderRadius: 10,
    padding: 4, marginBottom: 28,
  },
  tab: {
    padding: '9px 0', border: 'none', cursor: 'pointer',
    borderRadius: 8, fontSize: 14, fontWeight: 500,
    fontFamily: 'var(--font-display)',
    background: 'transparent', color: 'var(--text-secondary)',
    transition: 'var(--transition)',
  },
  tabActive: { background: 'var(--bg-surface)', color: 'var(--text-primary)', boxShadow: '0 1px 4px rgba(0,0,0,0.4)' },
  form: { display: 'flex', flexDirection: 'column', gap: 18 },
  label: { fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500, letterSpacing: '0.02em' },
  input: {
    background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)',
    borderRadius: 10, padding: '11px 14px',
    fontSize: 14, color: 'var(--text-primary)', fontFamily: 'var(--font-display)',
    transition: 'border-color var(--transition), box-shadow var(--transition)',
    width: '100%',
  },
  error: { background: 'rgba(255,77,109,0.08)', border: '1px solid rgba(255,77,109,0.2)', borderRadius: 8, padding: '10px 14px' },
  submitBtn: {
    marginTop: 4, padding: '13px', background: 'var(--accent)',
    color: '#0a0a0b', border: 'none', borderRadius: 10,
    fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-display)',
    cursor: 'pointer', transition: 'opacity var(--transition), transform var(--transition)',
    letterSpacing: '0.01em',
  },
  note: { marginTop: 18, textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 },
}
