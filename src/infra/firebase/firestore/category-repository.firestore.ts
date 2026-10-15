import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  updateDoc,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import { getDb } from '../config'
import type { Category } from '@/core/domain/entities/category'
import type { CategoryPatch, CategoryRepository, NewCategory } from '@/core/domain/ports/category-repository'

const toCategory = (snap: QueryDocumentSnapshot): Category => {
  const d = snap.data()
  return {
    id: snap.id,
    name: d.name,
    slug: d.slug,
    icon: d.icon,
    order: d.order ?? 0,
    status: d.status ?? 'active',
  }
}

const slugify = (name: string) =>
  name
    .trim()
    .toLowerCase()
    .replace(/[\s]+/g, '-')
    .replace(/[^a-zа-я0-9-]/gi, '')

export class FirestoreCategoryRepository implements CategoryRepository {
  private db = getDb()
  private coll = collection(this.db, 'categories')

  async listAll(): Promise<Category[]> {
    const q = query(this.coll, orderBy('order', 'asc'))
    const snap = await getDocs(q)
    return snap.docs.map(toCategory)
  }

  subscribe(cb: (categories: Category[]) => void): () => void {
    const q = query(this.coll, orderBy('order', 'asc'))
    return onSnapshot(
      q,
      (snap) => cb(snap.docs.map(toCategory)),
      (err) => console.error('[firestore] categories.subscribe', err),
    )
  }

  async byId(id: string): Promise<Category | null> {
    const snap = await getDoc(doc(this.db, 'categories', id))
    if (!snap.exists()) return null
    const d = snap.data()
    return {
      id: snap.id,
      name: d.name,
      slug: d.slug,
      icon: d.icon,
      order: d.order ?? 0,
      status: d.status ?? 'active',
    }
  }

  async createCategory(input: NewCategory): Promise<Category> {
    const all = await this.listAll()
    const order = all.length ? Math.max(...all.map((c) => c.order)) + 1 : 0
    const ref = await addDoc(this.coll, {
      name: input.name.trim(),
      slug: slugify(input.name) || 'other',
      icon: input.icon,
      order,
      status: 'active' as const,
    })
    const snap = await getDoc(ref)
    const d = snap.data()!
    return {
      id: snap.id,
      name: d.name,
      slug: d.slug,
      icon: d.icon,
      order: d.order ?? 0,
      status: d.status ?? 'active',
    }
  }

  async updateCategory(id: string, patch: CategoryPatch): Promise<void> {
    await updateDoc(doc(this.db, 'categories', id), {
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.icon !== undefined ? { icon: patch.icon } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.order !== undefined ? { order: patch.order } : {}),
    })
  }
}
