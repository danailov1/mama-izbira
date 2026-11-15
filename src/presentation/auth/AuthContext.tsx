import { createContext, useContext, useEffect, useState } from 'react'
import type { AppUser, AuthSession } from '@/core/domain/entities/user'
import { getServices } from '@/infra/di'
import { DomainError } from '@/core/usecases/auth-service'

interface AuthContextValue {
  session: AuthSession | null
  user: AppUser | null
  loading: boolean
  error: string | null
  clearError: () => void
  loginWithGoogle: () => Promise<void>
  loginWithEmail: (email: string, password: string) => Promise<void>
  registerWithEmail: (email: string, password: string, displayName: string) => Promise<void>
  logout: () => Promise<void>
  resetPassword: (email: string) => Promise<void>
  resendVerification: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth трябва да се ползва в AuthProvider')
  return ctx
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { auth } = getServices()
  const [session, setSession] = useState<AuthSession | null>(null)
  const [user, setUser] = useState<AppUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((s) => setSession(s))
    return unsub
  }, [auth])

  useEffect(() => {
    // Довършва Google redirect входа (мобилни браузъри). Самата сесия идва през
    // onAuthStateChanged; тук само показваме грешка, ако redirect-ът се е провалил.
    auth.completeRedirectSignIn().catch((e) => {
      if (e instanceof DomainError) setError(e.message)
      else if (e instanceof Error) setError(translateAuthError(e.message))
      else setError('Неуспешно влизане с Google. Опитай отново.')
    })
  }, [auth])

  useEffect(() => {
    if (!session) {
      setUser(null)
      setLoading(false)
      return
    }
    setLoading(true)
    const unsub = auth.subscribeProfile(session.uid, (profile) => {
      setUser(profile)
      setLoading(false)
    })
    return unsub
  }, [auth, session])

  const run = async (fn: () => Promise<unknown>) => {
    setError(null)
    try {
      await fn()
    } catch (e) {
      if (e instanceof DomainError) setError(e.message)
      else if (e instanceof Error) setError(translateAuthError(e.message))
      else setError('Нещо се обърка. Опитай отново.')
      throw e
    }
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        loading,
        error,
        clearError: () => setError(null),
        loginWithGoogle: () => run(() => auth.signInWithGoogle()),
        loginWithEmail: (email, password) => run(() => auth.signInWithEmail(email, password)),
        registerWithEmail: (email, password, displayName) =>
          run(() => auth.signUpWithEmail(email, password, displayName)),
        logout: () => run(() => auth.signOut()),
        resetPassword: (email) => run(() => auth.sendPasswordReset(email)),
        resendVerification: () =>
          run(async () => {
            await auth.sendEmailVerification()
            setSession(await auth.reloadSession())
          }),
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

function translateAuthError(message: string): string {
  const map: Record<string, string> = {
    'auth/invalid-credential': 'Грешен имейл или парола.',
    'auth/invalid-email': 'Невалиден имейл адрес.',
    'auth/user-not-found': 'Няма потребител с този имейл.',
    'auth/wrong-password': 'Грешна парола.',
    'auth/email-already-in-use': 'Този имейл вече е регистриран.',
    'auth/weak-password': 'Паролата е твърде слаба — минимум 6 символа.',
    'auth/popup-closed-by-user': 'Прозорецът за вход беше затворен.',
    'auth/popup-blocked': 'Браузърът блокира изскачащия прозорец. Разреши го и опитай пак.',
    'auth/cancelled-popup-request': 'Предишният опит за вход не завърши. Опитай отново.',
    'auth/unauthorized-domain':
      'Този домейн не е разрешен за вход с Google. Добави го във Firebase → Authentication → Settings → Authorized domains.',
    'auth/operation-not-allowed': 'Входът с Google не е активиран за този проект.',
    'auth/account-exists-with-different-credential':
      'Вече има профил с този имейл. Влез с имейл и парола, после свържи Google.',
    'auth/network-request-failed': 'Няма връзка със сървъра. Провери интернета и опитай пак.',
    'auth/too-many-requests': 'Твърде много опити. Изчакай минута и опитай пак.',
    'auth/invalid-api-key': 'Конфигурацията на Firebase е невалидна (API ключ).',
    'auth/internal-error': 'Временна грешка във Firebase. Опитай отново.',
  }
  for (const [code, text] of Object.entries(map)) {
    if (message.includes(code)) return text
  }
  // Непознат код: покажи го, за да е диагностицируемо, вместо да го скриеш.
  const unknown = /auth\/[a-z-]+/.exec(message)?.[0]
  return unknown ? `Неуспешно влизане (${unknown}). Опитай отново.` : 'Неуспешно влизане. Опитай отново.'
}
