import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  orderBy,
  addDoc,
  updateDoc,
  limit,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import { getDb } from '../config'
import type { NewProduct, Product, ProductStatus } from '@/core/domain/entities/product'
import type { ProductQuery, ProductRepository } from '@/core/domain/ports/product-repository'

const toProduct = (snap: QueryDocumentSnapshot): Product => {
  const d = snap.data()
  const reviewsCount = d.reviewsCount ?? 0
  const ratingSum = d.ratingSum ?? 0
  return {
    id: snap.id,
    brand: d.brand,
    model: d.model,
    categoryId: d.categoryId,
    imageUrl: d.imageUrl,
    status: d.status,
    rejectionReason: d.rejectionReason,
    createdBy: d.createdBy,
    createdAt: d.createdAt?.toMillis?.() ?? d.createdAt ?? 0,
    avgRating: reviewsCount > 0 ? Math.round((ratingSum / reviewsCount) * 10) / 10 : 0,
    reviewsCount,
  }
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

export class FirestoreProductRepository implements ProductRepository {
  private db = getDb()
  private coll = collection(this.db, 'products')

  async query(queryOpts: ProductQuery = {}): Promise<Product[]> {
    const base: Parameters<typeof query>[1][] = []
    if (queryOpts.status) base.push(where('status', '==', queryOpts.status))
    if (queryOpts.categoryId) base.push(where('categoryId', '==', queryOpts.categoryId))
    base.push(orderBy('createdAt', 'desc'))
    const q = query(this.coll, ...base, limit(queryOpts.limit ?? 200))
    const snap = await getDocs(q)
    let items = snap.docs.map(toProduct)

    const search = queryOpts.search?.trim().toLowerCase()
    if (search) {
      items = items.filter((p) => `${p.brand} ${p.model}`.toLowerCase().includes(search))
    }
    if (queryOpts.minRating) {
      items = items.filter((p) => p.avgRating >= queryOpts.minRating!)
    }
    if (queryOpts.sort === 'rating') {
      items = [...items].sort((a, b) => b.avgRating - a.avgRating || b.reviewsCount - a.reviewsCount)
    } else if (queryOpts.sort === 'top') {
      items = [...items].sort((a, b) => b.reviewsCount - a.reviewsCount || b.avgRating - a.avgRating)
    }
    return items.slice(0, queryOpts.limit ?? 200)
  }

  async getById(id: string): Promise<Product | null> {
    const snap = await getDoc(doc(this.db, 'products', id))
    if (!snap.exists()) return null
    return toProduct(snap as unknown as QueryDocumentSnapshot)
  }

  subscribeById(id: string, cb: (product: Product | null) => void): () => void {
    return onSnapshot(
      doc(this.db, 'products', id),
      (snap) => cb(snap.exists() ? toProduct(snap as unknown as QueryDocumentSnapshot) : null),
      (err) => console.error('[firestore] products.subscribeById', err),
    )
  }

  async create(input: NewProduct, userId: string): Promise<Product> {
    const ref = await addDoc(this.coll, {
      brand: input.brand,
      model: input.model,
      categoryId: input.categoryId,
      imageUrl: input.imageUrl ?? null,
      status: 'pending' as ProductStatus,
      createdBy: userId,
      createdAt: new Date(),
      ratingSum: 0,
      reviewsCount: 0,
    })
    const snap = await getDoc(ref)
    return toProduct(snap as unknown as QueryDocumentSnapshot)
  }

  async setStatus(id: string, status: ProductStatus, rejectionReason?: string): Promise<void> {
    await updateDoc(doc(this.db, 'products', id), {
      status,
      ...(status === 'rejected' ? { rejectionReason: rejectionReason ?? null } : {}),
    })
  }

  async searchDuplicates(brand: string, model: string): Promise<Product[]> {
    const q = query(this.coll, where('status', '==', 'approved'), limit(500))
    const snap = await getDocs(q)
    return snap.docs
      .map(toProduct)
      .filter((p) => norm(p.brand) === norm(brand) && norm(p.model) === norm(model))
  }

  subscribeMine(userId: string, cb: (products: Product[]) => void): () => void {
    const q = query(this.coll, where('createdBy', '==', userId), orderBy('createdAt', 'desc'))
    return onSnapshot(
      q,
      (snap) => cb(snap.docs.map(toProduct)),
      (err) => console.error('[firestore] products.subscribeMine', err),
    )
  }

  subscribePending(cb: (products: Product[]) => void): () => void {
    const q = query(this.coll, where('status', '==', 'pending'), orderBy('createdAt', 'asc'))
    return onSnapshot(
      q,
      (snap) => cb(snap.docs.map(toProduct)),
      (err) => console.error('[firestore] products.subscribePending', err),
    )
  }
}
