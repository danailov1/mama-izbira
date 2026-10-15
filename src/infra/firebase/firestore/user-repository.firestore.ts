import { doc, getDoc, onSnapshot, setDoc, serverTimestamp, type QueryDocumentSnapshot } from 'firebase/firestore'
import { getDb } from '../config'
import type { AppUser, Role } from '@/core/domain/entities/user'
import type { UserRepository } from '@/core/domain/ports/user-repository'

const toUser = (snap: QueryDocumentSnapshot): AppUser => {
  const d = snap.data()
  return {
    id: snap.id,
    displayName: d.displayName ?? '',
    email: d.email ?? '',
    role: d.role ?? 'user',
    createdAt: d.createdAt?.toMillis?.() ?? d.createdAt ?? 0,
  }
}

export class FirestoreUserRepository implements UserRepository {
  private db = getDb()

  private ref(uid: string) {
    return doc(this.db, 'users', uid)
  }

  async getById(id: string): Promise<AppUser | null> {
    const snap = await getDoc(this.ref(id))
    if (!snap.exists()) return null
    return toUser(snap as unknown as QueryDocumentSnapshot)
  }

  async getByEmail(email: string): Promise<AppUser | null> {
    const users = await getDoc(this.ref(email.toLowerCase()))
    if (!users.exists()) return null
    return toUser(users as unknown as QueryDocumentSnapshot)
  }

  async upsertFromAuth(uid: string, email: string | null, displayName: string | null): Promise<AppUser> {
    const ref = this.ref(uid)
    const existing = await getDoc(ref)
    const fallbackName = email ? email.split('@')[0] : 'Родител'
    const data: Record<string, unknown> = {
      email: email ?? '',
      displayName: displayName?.trim() || fallbackName,
      updatedAt: serverTimestamp(),
    }
    if (!existing.exists()) {
      data.role = 'user' as Role
      data.createdAt = serverTimestamp()
    }
    await setDoc(ref, data, { merge: true })
    return toUser((await getDoc(ref)) as unknown as QueryDocumentSnapshot)
  }

  subscribe(uid: string, cb: (user: AppUser | null) => void): () => void {
    return onSnapshot(
      this.ref(uid),
      (snap) => cb(snap.exists() ? toUser(snap as unknown as QueryDocumentSnapshot) : null),
      (err) => {
        console.error('[firestore] users.subscribe', err)
        cb(null)
      },
    )
  }
}
