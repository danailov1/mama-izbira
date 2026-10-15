import type { AppUser, AuthSession } from '../domain/entities/user'
import type { AuthGateway } from '../domain/ports/auth-gateway'
import type { UserRepository } from '../domain/ports/user-repository'

export class DomainError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
    this.name = 'DomainError'
  }
}

export class AuthService {
  constructor(
    private readonly auth: AuthGateway,
    private readonly users: UserRepository,
  ) {}

  onAuthStateChanged(listener: (session: AuthSession | null) => void): () => void {
    return this.auth.onAuthStateChanged(listener)
  }

  async signInWithGoogle(): Promise<AppUser> {
    const session = await this.auth.signInWithGoogle()
    return this.users.upsertFromAuth(session.uid, session.email, session.displayName)
  }

  async signInWithEmail(email: string, password: string): Promise<AppUser> {
    const session = await this.auth.signInWithEmail(email, password)
    return this.users.upsertFromAuth(session.uid, session.email, session.displayName)
  }

  async signUpWithEmail(email: string, password: string, displayName: string): Promise<AppUser> {
    const session = await this.auth.signUpWithEmail(email, password, displayName)
    return this.users.upsertFromAuth(session.uid, session.email, session.displayName)
  }

  async signOut(): Promise<void> {
    await this.auth.signOut()
  }

  sendPasswordReset(email: string): Promise<void> {
    return this.auth.sendPasswordReset(email)
  }

  sendEmailVerification(): Promise<void> {
    return this.auth.sendEmailVerification()
  }

  reloadSession(): Promise<AuthSession | null> {
    return this.auth.reloadSession()
  }

  getProfile(uid: string): Promise<AppUser | null> {
    return this.users.getById(uid)
  }

  subscribeProfile(uid: string, cb: (user: AppUser | null) => void): () => void {
    return this.users.subscribe(uid, cb)
  }
}

export function isModerator(user: AppUser | null): boolean {
  return user?.role === 'moderator' || user?.role === 'admin'
}

export function isAdmin(user: AppUser | null): boolean {
  return user?.role === 'admin'
}
