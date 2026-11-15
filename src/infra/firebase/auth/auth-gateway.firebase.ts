import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getRedirectResult,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut as fbSignOut,
  updateProfile,
  type User,
} from 'firebase/auth'
import type { AuthGateway } from '@/core/domain/ports/auth-gateway'
import type { AuthSession } from '@/core/domain/entities/user'
import { getAuthInstance } from '../config'

const isMobileBrowser = (): boolean =>
  typeof navigator !== 'undefined' &&
  /Android|iPhone|iPad|iPod|Mobile|Opera Mini|IEMobile/i.test(navigator.userAgent)

/**
 * Popup-ът не е надежден в част от средите (блокирани попъпи, вградени браузъри,
 * строги настройки). В тези случаи падаме към redirect, вместо входът да умре.
 */
const POPUP_FALLBACK_CODES = new Set([
  'auth/popup-blocked',
  'auth/operation-not-supported-in-this-environment',
  'auth/web-storage-unsupported',
])

const isPopupFallbackError = (err: unknown): boolean => {
  const code = (err as { code?: string } | null)?.code ?? ''
  return POPUP_FALLBACK_CODES.has(code)
}

const toSession = (user: User | null): AuthSession | null => {
  if (!user) return null
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoUrl: user.photoURL,
    isAnonymous: user.isAnonymous,
    emailVerified: user.emailVerified,
  }
}

export class FirebaseAuthGateway implements AuthGateway {
  private auth = getAuthInstance()

  onAuthStateChanged(listener: (session: AuthSession | null) => void): () => void {
    return onAuthStateChanged(this.auth, (user) => listener(toSession(user)))
  }

  async signInWithGoogle(): Promise<AuthSession> {
    const provider = new GoogleAuthProvider()
    // Винаги показвай избора на акаунт — иначе „тихият“ вход с последния акаунт
    // изглежда като нищо да не се е случило на споделени устройства.
    provider.setCustomParameters({ prompt: 'select_account' })
    if (isMobileBrowser()) {
      // Попъпите са ненадеждни в мобилен Safari/вградени браузъри — използваме redirect.
      await signInWithRedirect(this.auth, provider)
      return new Promise<AuthSession>(() => {})
    }
    try {
      const cred = await signInWithPopup(this.auth, provider)
      return toSession(cred.user)!
    } catch (err) {
      if (isPopupFallbackError(err)) {
        await signInWithRedirect(this.auth, provider)
        return new Promise<AuthSession>(() => {})
      }
      throw err
    }
  }

  async completeRedirectSignIn(): Promise<AuthSession | null> {
    try {
      const cred = await getRedirectResult(this.auth)
      return cred ? toSession(cred.user) : null
    } catch (err) {
      console.error('[auth] completeRedirectSignIn', err)
      // Подаваме грешката нагоре, за да я види потребителят, вместо тихо да изчезне.
      throw err
    }
  }

  async signInWithEmail(email: string, password: string): Promise<AuthSession> {
    const cred = await signInWithEmailAndPassword(this.auth, email, password)
    return toSession(cred.user)!
  }

  async signUpWithEmail(email: string, password: string, displayName: string): Promise<AuthSession> {
    const cred = await createUserWithEmailAndPassword(this.auth, email, password)
    try {
      await updateProfile(cred.user, { displayName })
    } catch {
      // профилното име не е критично — ще се вземе от email при нужда
    }
    try {
      await sendEmailVerification(cred.user)
    } catch {
      // верификационният имейл не бива да блокира регистрацията
    }
    return toSession(cred.user)!
  }

  async signOut(): Promise<void> {
    await fbSignOut(this.auth)
  }

  async sendPasswordReset(email: string): Promise<void> {
    await sendPasswordResetEmail(this.auth, email)
  }

  async sendEmailVerification(): Promise<void> {
    const user = this.auth.currentUser
    if (!user) throw new Error('auth/no-current-user')
    await sendEmailVerification(user)
  }

  async reloadSession(): Promise<AuthSession | null> {
    const user = this.auth.currentUser
    if (!user) return null
    await reload(user)
    return toSession(user)
  }
}
