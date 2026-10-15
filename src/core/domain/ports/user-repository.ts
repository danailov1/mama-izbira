import type { AppUser } from '../entities/user'

export interface UserRepository {
  getById(id: string): Promise<AppUser | null>
  getByEmail(email: string): Promise<AppUser | null>
  upsertFromAuth(uid: string, email: string | null, displayName: string | null): Promise<AppUser>
  subscribe(uid: string, cb: (user: AppUser | null) => void): () => void
}
