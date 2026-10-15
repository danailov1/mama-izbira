import type { AppUser } from '../domain/entities/user'
import type { NewReview, Review, VoteType } from '../domain/entities/review'
import type { ReviewRepository } from '../domain/ports/review-repository'
import type { VoteRepository } from '../domain/ports/vote-repository'
import type { ProductRepository } from '../domain/ports/product-repository'
import { DomainError, isModerator } from './auth-service'

export class ReviewService {
  constructor(
    private readonly reviews: ReviewRepository,
    private readonly products: ProductRepository,
  ) {}

  listByProduct(productId: string): Promise<Review[]> {
    return this.reviews.listByProduct(productId).then(this.sortByUsefulness)
  }

  subscribeByProduct(productId: string, cb: (reviews: Review[]) => void): () => void {
    return this.reviews.subscribeByProduct(productId, (all) => cb(this.sortByUsefulness(all)))
  }

  private sortByUsefulness(reviews: Review[]): Review[] {
    return reviews
      .filter((r) => r.status === 'visible')
      .sort((a, b) => b.netScore - a.netScore || b.createdAt - a.createdAt)
  }

  getMyReview(productId: string, userId: string): Promise<Review | null> {
    return this.reviews.getByProductAndUser(productId, userId)
  }

  subscribeMine(userId: string, cb: (reviews: Review[]) => void): () => void {
    return this.reviews.subscribeMine(userId, cb)
  }

  async addReview(input: NewReview, user: AppUser): Promise<Review> {
    if (!user) throw new DomainError('auth_required', 'Трябва да си влязъл, за да пишеш ревю.')
    if (input.rating < 1 || input.rating > 5 || !Number.isInteger(input.rating))
      throw new DomainError('invalid_rating', 'Оценката трябва да е цяло число от 1 до 5.')
    if (input.text.trim().length < 10)
      throw new DomainError('invalid_text', 'Ревюто трябва да е поне 10 символа, за да е полезно за другите.')

    const product = await this.products.getById(input.productId)
    if (!product) throw new DomainError('not_found', 'Продуктът не съществува.')
    if (product.status !== 'approved')
      throw new DomainError('not_approved', 'Можеш да пишеш ревю само за одобрени продукти.')

    const existing = await this.reviews.getByProductAndUser(input.productId, user.id)
    if (existing) throw new DomainError('already_reviewed', 'Вече си написал ревю за този продукт.')

    const review = await this.reviews.create(
      {
        productId: input.productId,
        rating: input.rating,
        text: input.text.trim(),
      },
      user.id,
    )
    return review
  }

  async updateReview(productId: string, reviewId: string, rating: number, text: string, userId: string): Promise<void> {
    if (rating < 1 || rating > 5 || !Number.isInteger(rating))
      throw new DomainError('invalid_rating', 'Оценката трябва да е цяло число от 1 до 5.')
    if (text.trim().length < 10)
      throw new DomainError('invalid_text', 'Ревюто трябва да е поне 10 символа.')

    await this.assertOwned(productId, reviewId, userId)
    await this.reviews.update(productId, reviewId, rating, text.trim())
  }

  async deleteReview(productId: string, reviewId: string, userId: string): Promise<void> {
    await this.assertOwned(productId, reviewId, userId)
    await this.reviews.remove(productId, reviewId)
  }

  async moderateRemove(productId: string, reviewId: string, moderator: AppUser): Promise<void> {
    if (!moderator || !isModerator(moderator))
      throw new DomainError('forbidden', 'Само модератори могат да премахват чужди ревюта.')
    const review = await this.reviews.getByProductAndUser(productId, reviewId)
    if (!review || review.status === 'removed')
      throw new DomainError('not_found', 'Ревюто не съществува.')
    await this.reviews.setRemoved(productId, reviewId)
  }

  async reportReview(
    productId: string,
    reviewId: string,
    reason: string,
    reporter: AppUser,
  ): Promise<void> {
    if (!reporter) throw new DomainError('auth_required', 'Трябва да си влязъл, за да докладваш.')
    if (reason.trim().length < 5)
      throw new DomainError('invalid_reason', 'Опиши проблема с поне 5 символа.')
    const review = await this.reviews.getByProductAndUser(productId, reviewId)
    if (!review) throw new DomainError('not_found', 'Ревюто не съществува.')
    if (review.userId === reporter.id)
      throw new DomainError('self_report', 'Не можеш да докладваш собствено ревю.')
    await this.reviews.createReport({
      productId,
      reviewId,
      userId: reporter.id,
      reason: reason.trim(),
      status: 'new',
    })
  }

  private async assertOwned(productId: string, reviewId: string, userId: string): Promise<void> {
    const review = await this.reviews.getByProductAndUser(productId, reviewId)
    if (!review) throw new DomainError('not_found', 'Ревюто не съществува.')
    if (review.userId !== userId)
      throw new DomainError('forbidden', 'Можеш да променяш само собствените си ревюта.')
  }
}

export class VoteService {
  constructor(
    private readonly votes: VoteRepository,
    private readonly reviews: ReviewRepository,
  ) {}

  async toggle(productId: string, reviewId: string, type: VoteType, user: AppUser): Promise<void> {
    if (!user) throw new DomainError('auth_required', 'Трябва да си влязъл, за да гласуваш.')
    const review = await this.reviews.getByProductAndUser(productId, reviewId)
    if (!review || review.status !== 'visible')
      throw new DomainError('not_found', 'Ревюто не съществува.')
    if (review.userId === user.id)
      throw new DomainError('self_vote', 'Не можеш да гласуваш за собствено ревю.')

    const existing = await this.votes.getForReview(productId, reviewId, user.id)
    if (existing && existing.type === type) {
      await this.votes.clear(productId, reviewId, user.id)
    } else {
      await this.votes.cast(productId, reviewId, user.id, type)
    }
  }

  async getMyVote(productId: string, reviewId: string, userId: string) {
    return this.votes.getForReview(productId, reviewId, userId)
  }
}
