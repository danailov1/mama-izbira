import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  orderBy,
  runTransaction,
  addDoc,
  increment,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import { getDb } from '../config'
import type { NewReview, Report, Review } from '@/core/domain/entities/review'
import type { ReviewRepository } from '@/core/domain/ports/review-repository'

const toReview = (snap: QueryDocumentSnapshot): Review => {
  const d = snap.data()
  return {
    id: snap.id,
    productId: d.productId,
    userId: d.userId,
    rating: d.rating,
    text: d.text,
    upvotes: d.upvotes ?? 0,
    downvotes: d.downvotes ?? 0,
    netScore: d.netScore ?? 0,
    status: d.status ?? 'visible',
    createdAt: d.createdAt?.toMillis?.() ?? d.createdAt ?? 0,
    updatedAt: d.updatedAt?.toMillis?.() ?? d.updatedAt ?? 0,
  }
}

export class FirestoreReviewRepository implements ReviewRepository {
  private db = getDb()

  private reviewsOf(productId: string) {
    return collection(this.db, 'products', productId, 'reviews')
  }

  private reviewDoc(productId: string, userId: string) {
    return doc(this.db, 'products', productId, 'reviews', userId)
  }

  private productDoc(productId: string) {
    return doc(this.db, 'products', productId)
  }

  async getByProductAndUser(productId: string, userId: string): Promise<Review | null> {
    const snap = await getDoc(this.reviewDoc(productId, userId))
    if (!snap.exists()) return null
    return toReview(snap as unknown as QueryDocumentSnapshot)
  }

  async listByProduct(productId: string): Promise<Review[]> {
    const q = query(this.reviewsOf(productId), where('status', '==', 'visible'), orderBy('createdAt', 'desc'))
    const snap = await getDocs(q)
    return snap.docs.map(toReview)
  }

  subscribeByProduct(productId: string, cb: (reviews: Review[]) => void): () => void {
    const q = query(this.reviewsOf(productId), where('status', '==', 'visible'), orderBy('createdAt', 'desc'))
    return onSnapshot(
      q,
      (snap) => cb(snap.docs.map(toReview)),
      (err) => console.error('[firestore] reviews.subscribeByProduct', err),
    )
  }

  async create(input: NewReview, userId: string): Promise<Review> {
    await runTransaction(this.db, async (tx) => {
      const productSnap = await tx.get(this.productDoc(input.productId))
      if (!productSnap.exists()) throw new Error('product_not_found')
      const ref = this.reviewDoc(input.productId, userId)
      if ((await tx.get(ref)).exists()) throw new Error('review_exists')
      tx.set(ref, {
        productId: input.productId,
        userId,
        rating: input.rating,
        text: input.text,
        upvotes: 0,
        downvotes: 0,
        netScore: 0,
        status: 'visible',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      tx.update(this.productDoc(input.productId), {
        reviewsCount: increment(1),
        ratingSum: increment(input.rating),
      })
    })
    return (await this.getByProductAndUser(input.productId, userId))!
  }

  async update(productId: string, reviewId: string, rating: number, text: string): Promise<void> {
    await runTransaction(this.db, async (tx) => {
      const ref = this.reviewDoc(productId, reviewId)
      const snap = await tx.get(ref)
      if (!snap.exists()) throw new Error('review_not_found')
      const oldRating = snap.data().rating
      tx.update(ref, { rating, text, updatedAt: new Date() })
      tx.update(this.productDoc(productId), {
        ratingSum: increment(rating - oldRating),
      })
    })
  }

  async remove(productId: string, reviewId: string): Promise<void> {
    await runTransaction(this.db, async (tx) => {
      const ref = this.reviewDoc(productId, reviewId)
      const snap = await tx.get(ref)
      if (!snap.exists()) return
      const rating = snap.data().rating
      tx.delete(ref)
      tx.update(this.productDoc(productId), {
        reviewsCount: increment(-1),
        ratingSum: increment(-rating),
      })
    })
  }

  async setRemoved(productId: string, reviewId: string): Promise<void> {
    await runTransaction(this.db, async (tx) => {
      const ref = this.reviewDoc(productId, reviewId)
      const snap = await tx.get(ref)
      if (!snap.exists()) return
      const rating = snap.data().rating
      tx.update(ref, { status: 'removed' })
      tx.update(this.productDoc(productId), {
        reviewsCount: increment(-1),
        ratingSum: increment(-rating),
      })
    })
  }

  subscribeMine(userId: string, cb: (reviews: Review[]) => void): () => void {
    const q = query(collectionGroup(this.db, 'reviews'), where('userId', '==', userId), orderBy('createdAt', 'desc'))
    return onSnapshot(
      q,
      (snap) => cb(snap.docs.map(toReview)),
      (err) => console.error('[firestore] reviews.subscribeMine', err),
    )
  }

  async createReport(report: Omit<Report, 'id' | 'createdAt'>): Promise<void> {
    await addDoc(collection(this.db, 'reports'), {
      ...report,
      createdAt: new Date(),
      status: 'new',
    })
  }
}
