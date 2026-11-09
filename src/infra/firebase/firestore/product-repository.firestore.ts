import {
  collection,
  doc,
  getDoc,
  getDocs,
  getCountFromServer,
  getAggregateFromServer,
  sum,
  onSnapshot,
  query,
  where,
  orderBy,
  addDoc,
  updateDoc,
  limit,
  startAfter,
  type QueryConstraint,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import { getDb } from '../config'
import type { NewProduct, Product, ProductStatus } from '@/core/domain/entities/product'
import { normalizeName, searchNameOf } from '@/core/domain/entities/product'
import type { ProductQuery, ProductRepository, PublicStats } from '@/core/domain/ports/product-repository'
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

export class FirestoreProductRepository implements ProductRepository {
  private db = getDb()
  private coll = collection(this.db, 'products')

  async query(queryOpts: ProductQuery = {}): Promise<Product[]> {
    const constraints: QueryConstraint[] = []
    const search = normalizeName(queryOpts.search ?? '')

    if (queryOpts.status) constraints.push(where('status', '==', queryOpts.status))
    if (queryOpts.categoryId) constraints.push(where('categoryId', '==', queryOpts.categoryId))
    if (search) {
      constraints.push(where('searchName', '>=', search))
      constraints.push(where('searchName', '<=', `${search}\uf8ff`))
      constraints.push(orderBy('searchName', 'asc'))
    } else {
      constraints.push(orderBy('createdAt', 'desc'))
    }
    if (queryOpts.cursorId) {
      constraints.push(startAfter(doc(this.db, 'products', queryOpts.cursorId)))
    }
    constraints.push(limit(queryOpts.limit ?? 60))

    const snap = await getDocs(query(this.coll, ...constraints))
    let items = snap.docs.map(toProduct)

    if (queryOpts.minRating) {
      items = items.filter((p) => p.avgRating >= queryOpts.minRating!)
    }
    if (queryOpts.sort === 'rating') {
      items = [...items].sort((a, b) => b.avgRating - a.avgRating || b.reviewsCount - a.reviewsCount)
    } else if (queryOpts.sort === 'top') {
      items = [...items].sort((a, b) => b.reviewsCount - a.reviewsCount || b.avgRating - a.avgRating)
    }
    return items
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
      (err) => {
        console.error('[firestore] products.subscribeById', err)
        // Само отказ за достъп означава „не е наличен“; другите грешки не бива
        // да превръщат валиден продукт в „не е намерен“.
        if ((err as { code?: string }).code === 'permission-denied') cb(null)
      },
    )
  }

  async create(input: NewProduct, userId: string): Promise<Product> {
    const ref = await addDoc(this.coll, {
      brand: input.brand,
      model: input.model,
      searchName: searchNameOf(input.brand, input.model),
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

  subscribeAll(cb: (products: Product[]) => void): () => void {
    const q = query(this.coll, orderBy('createdAt', 'desc'), limit(500))
    return onSnapshot(
      q,
      (snap) => cb(snap.docs.map(toProduct)),
      (err) => console.error('[firestore] products.subscribeAll', err),
    )
  }

  async getPublicStats(): Promise<PublicStats> {
    const approved = query(this.coll, where('status', '==', 'approved'))
    const [countSnap, aggregateSnap] = await Promise.all([
      getCountFromServer(approved),
      getAggregateFromServer(approved, { reviews: sum('reviewsCount') }),
    ])
    return {
      products: countSnap.data().count,
      reviews: aggregateSnap.data().reviews ?? 0,
    }
  }
}
