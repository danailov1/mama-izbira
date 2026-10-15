import type { NewReview, Report, Review } from '../entities/review'

/**
 * Ревютата живеят в subcollection `products/{productId}/reviews/{userId}`.
 * Документният id е userId — това структурно гарантира 1 ревю на потребител на продукт.
 */
export interface ReviewRepository {
  getByProductAndUser(productId: string, userId: string): Promise<Review | null>
  listByProduct(productId: string): Promise<Review[]>
  subscribeByProduct(productId: string, cb: (reviews: Review[]) => void): () => void
  create(review: NewReview, userId: string): Promise<Review>
  update(productId: string, reviewId: string, rating: number, text: string): Promise<void>
  remove(productId: string, reviewId: string): Promise<void>
  setRemoved(productId: string, reviewId: string): Promise<void>
  subscribeMine(userId: string, cb: (reviews: Review[]) => void): () => void
  createReport(report: Omit<Report, 'id' | 'createdAt'>): Promise<void>
}
