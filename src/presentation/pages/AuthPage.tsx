import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/presentation/auth/AuthContext'
import { Msr } from '@/presentation/components/ui/Msr'
import { Alert } from '@/presentation/components/ui/Alert'

type Mode = 'login' | 'register'

export function AuthPage() {
  const { loginWithGoogle, loginWithEmail, registerWithEmail, resetPassword, error, session, user, loading } =
    useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  useEffect(() => {
    if (!loading && session && user) navigate('/profile', { replace: true })
  }, [loading, session, user, navigate])

  const submit = async () => {
    setLocalError(null)
    setInfo(null)
    if (!email.includes('@') || password.length < 6) {
      setLocalError('Въведи валиден имейл и парола от поне 6 символа.')
      return
    }
    setBusy(true)
    try {
      if (mode === 'login') await loginWithEmail(email, password)
      else await registerWithEmail(email, password, name.trim() || email.split('@')[0])
      navigate('/profile', { replace: true })
    } catch {
      // грешката се показва от AuthContext
    } finally {
      setBusy(false)
    }
  }

  const google = async () => {
    setBusy(true)
    try {
      await loginWithGoogle()
      navigate('/profile', { replace: true })
    } catch {
      // грешка от AuthContext
    } finally {
      setBusy(false)
    }
  }

  const forgot = async () => {
    setLocalError(null)
    setInfo(null)
    if (!email.includes('@')) {
      setLocalError('Въведи имейла си, за да изпратим линк за нова парола.')
      return
    }
    setBusy(true)
    try {
      await resetPassword(email)
      setInfo(`Изпратихме линк за смяна на паролата на ${email}. Провери и „Спам“.`)
    } catch {
      // грешката се показва от AuthContext
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <div className="auth-wrap">
        <div className="center">
          <div className="hero-stars" style={{ justifyContent: 'center' }}>
            {[1, 2, 3, 4, 5].map((i) => (
              <Msr key={i} icon="star" fill />
            ))}
          </div>
          <span className="eyebrow" style={{ justifyContent: 'center' }}>
            <Msr icon="login" size="sm" />
            {mode === 'login' ? 'Добре дошла/дошъл!' : 'Присъедини се'}
          </span>
          <h1 className="page-title">{mode === 'login' ? 'Вход в профила' : 'Създай профил'}</h1>
          <p className="page-sub">
            {mode === 'login'
              ? 'Влез, за да пишеш ревюта и да гласуваш за полезните мнения.'
              : 'Регистрирай се, за да добавяш продукти и да споделяш опита си.'}
          </p>
        </div>

        <div style={{ marginTop: 24 }}>
          <button className="btn btn-ghost google-btn btn-block" style={{ justifyContent: 'center' }} onClick={google} disabled={busy}>
            <span className="brand-g">
              <span className="b">G</span>
              <span className="r">o</span>
              <span className="y">o</span>
              <span className="b">g</span>
              <span className="g2">l</span>
              <span className="r">e</span>
            </span>
            {mode === 'login' ? 'Вход с Google' : 'Регистрация с Google'}
          </button>
        </div>

        <div className="divider">или с имейл</div>

        {mode === 'register' && (
          <div className="field">
            <label>Име (как да те наричаме)</label>
            <div className="field-input-wrap">
              <Msr icon="person" size="sm" />
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="напр. Ивелина" />
            </div>
          </div>
        )}
        <div className="field">
          <label>Имейл</label>
          <div className="field-input-wrap">
            <Msr icon="mail" size="sm" />
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ti@primer.bg" />
          </div>
        </div>
        <div className="field">
          <label>Парола</label>
          <div className="field-input-wrap">
            <Msr icon="lock" size="sm" />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="минимум 6 символа"
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
          </div>
        </div>

        {mode === 'login' && (
          <p className="center muted" style={{ fontSize: 13, marginTop: -6, marginBottom: 14 }}>
            <button className="btn btn-ghost btn-sm" onClick={forgot} disabled={busy}>
              Забравена парола?
            </button>
          </p>
        )}

        {info && (
          <Alert kind="info" style={{ marginBottom: 14 }}>
            <b>Провери имейла си</b>
            {info}
          </Alert>
        )}

        {(error || localError) && (
          <Alert kind="error" style={{ marginBottom: 14 }}>
            <b>Неуспешно влизане</b>
            {localError ?? error}
          </Alert>
        )}

        <button className="btn btn-primary btn-block" style={{ justifyContent: 'center' }} onClick={submit} disabled={busy}>
          {busy ? <span className="spinner" /> : <Msr icon="login" size="sm" />}
          {mode === 'login' ? 'Влез' : 'Създай профила'}
        </button>

        <p className="center muted" style={{ fontSize: 13, marginTop: 18 }}>
          {mode === 'login' ? 'Нямаш профил?' : 'Вече имаш профил?'}{' '}
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login')
              setLocalError(null)
            }}
          >
            {mode === 'login' ? 'Регистрирай се' : 'Влез'}
          </button>
        </p>
      </div>
    </div>
  )
}
