import {
  collection,
  doc,
  getDoc,
  runTransaction,
  increment,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import { getDb } from '../config'
import type { Vote, VoteType } from '@/core/domain/entities/review'
import type { VoteRepository } from '@/core/domain/ports/vote-repository'

const toVote = (snap: QueryDocumentSnapshot, reviewId: string): Vote => ({
  id: snap.id,
  reviewId,
  userId: snap.id,
  type: snap.data().type,
  createdAt: snap.data().createdAt?.toMillis?.() ?? 0,
})

export class FirestoreVoteRepository implements VoteRepository {
  private db = getDb()

  private votesOf(productId: string, reviewId: string) {
    return collection(this.db, 'products', productId, 'reviews', reviewId, 'votes')
  }

  private reviewDoc(productId: string, reviewId: string) {
    return doc(this.db, 'products', productId, 'reviews', reviewId)
  }

  private voteDoc(productId: string, reviewId: string, userId: string) {
    return doc(this.votesOf(productId, reviewId), userId)
  }

  async getForReview(productId: string, reviewId: string, userId: string): Promise<Vote | null> {
    const snap = await getDoc(this.voteDoc(productId, reviewId, userId))
    if (!snap.exists()) return null
    return toVote(snap as unknown as QueryDocumentSnapshot, reviewId)
  }

  async cast(productId: string, reviewId: string, userId: string, type: VoteType): Promise<void> {
    await runTransaction(this.db, async (tx) => {
      const reviewSnap = await tx.get(this.reviewDoc(productId, reviewId))
      if (!reviewSnap.exists()) throw new Error('review_not_found')
      const voteSnap = await tx.get(this.voteDoc(productId, reviewId, userId))
      const previous = voteSnap.exists() ? voteSnap.data().type : null

      if (previous === type) {
        // тогъл в ход от друг клик — без промяна
        return
      }

      let upDelta = 0
      let downDelta = 0
      let netDelta = 0

      if (previous === null) {
        if (type === 'up') {
          upDelta = 1
          netDelta = 1
        } else {
          downDelta = 1
          netDelta = -1
        }
      } else {
        if (previous === 'up' && type === 'down') {
          upDelta = -1
          downDelta = 1
          netDelta = -2
        } else if (previous === 'down' && type === 'up') {
          upDelta = 1
          downDelta = -1
          netDelta = 2
        }
      }

      tx.set(this.voteDoc(productId, reviewId, userId), {
        type,
        createdAt: new Date(),
      })
      tx.update(this.reviewDoc(productId, reviewId), {
        upvotes: increment(upDelta),
        downvotes: increment(downDelta),
        netScore: increment(netDelta),
      })
    })
  }

  async clear(productId: string, reviewId: string, userId: string): Promise<void> {
    await runTransaction(this.db, async (tx) => {
      const voteSnap = await tx.get(this.voteDoc(productId, reviewId, userId))
      if (!voteSnap.exists()) return
      const type = voteSnap.data().type
      const upDelta = type === 'up' ? -1 : 0
      const downDelta = type === 'down' ? -1 : 0
      const netDelta = type === 'up' ? -1 : 1
      tx.delete(this.voteDoc(productId, reviewId, userId))
      tx.update(this.reviewDoc(productId, reviewId), {
        upvotes: increment(upDelta),
        downvotes: increment(downDelta),
        netScore: increment(netDelta),
      })
    })
  }
}
