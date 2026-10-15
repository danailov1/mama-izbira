import type { Vote, VoteType } from '../entities/review'

/**
 * Гласовете живеят в `products/{productId}/reviews/{reviewId}/votes/{userId}` —
 * 1 глас на потребител на ревю (doc id = userId, upsert/toggle).
 */
export interface VoteRepository {
  getForReview(productId: string, reviewId: string, userId: string): Promise<Vote | null>
  cast(productId: string, reviewId: string, userId: string, type: VoteType): Promise<void>
  clear(productId: string, reviewId: string, userId: string): Promise<void>
}
