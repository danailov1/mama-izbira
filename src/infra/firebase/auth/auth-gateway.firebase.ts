import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as fbSignOut,
  updateProfile,
  type User,
} from 'firebase/auth'
import type { AuthGateway } from '@/core/domain/ports/auth-gateway'
import type { AuthSession } from '@/core/domain/entities/user'
import { getAuthInstance } from '../config'

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
    const cred = await signInWithPopup(this.auth, provider)
    return toSession(cred.user)!
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
