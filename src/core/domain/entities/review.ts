export type ReviewStatus = 'visible' | 'removed'

export interface Review {
  id: string
  productId: string
  userId: string
  rating: number
  text: string
  upvotes: number
  downvotes: number
  netScore: number
  status: ReviewStatus
  createdAt: number
  updatedAt: number
}

export interface NewReview {
  productId: string
  rating: number
  text: string
}

export type VoteType = 'up' | 'down'

export interface Vote {
  id: string
  reviewId: string
  userId: string
  type: VoteType
  createdAt: number
}

export type ReportStatus = 'new' | 'handled'

export interface Report {
  id: string
  productId: string
  /** id на ревюто в subcollection-а (== userId на автора) */
  reviewId: string
  /** кой е подал доклада */
  userId: string
  reason: string
  status: ReportStatus
  handledBy?: string
  handledAt?: number
  createdAt: number
}
