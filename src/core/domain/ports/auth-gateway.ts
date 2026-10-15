import type { AuthSession } from '../entities/user'

export interface AuthGateway {
  onAuthStateChanged(listener: (session: AuthSession | null) => void): () => void
  signInWithGoogle(): Promise<AuthSession>
  signInWithEmail(email: string, password: string): Promise<AuthSession>
  signUpWithEmail(email: string, password: string, displayName: string): Promise<AuthSession>
  signOut(): Promise<void>
  sendPasswordReset(email: string): Promise<void>
  sendEmailVerification(): Promise<void>
  reloadSession(): Promise<AuthSession | null>
}
