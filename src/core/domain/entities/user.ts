export type Role = 'user' | 'moderator' | 'admin'

export interface AppUser {
  id: string
  displayName: string
  email: string
  role: Role
  createdAt: number
}

export interface AuthSession {
  uid: string
  email: string | null
  displayName: string | null
  photoUrl: string | null
  isAnonymous: boolean
  emailVerified: boolean
}
