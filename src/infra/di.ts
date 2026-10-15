import type { AuthService } from '@/core/usecases/auth-service'
import type { CatalogService } from '@/core/usecases/catalog-service'
import type { ProductService } from '@/core/usecases/product-service'
import type { ModerationService } from '@/core/usecases/moderation-service'
import type { ReviewService, VoteService } from '@/core/usecases/review-service'

import { FirebaseAuthGateway } from './firebase/auth/auth-gateway.firebase'
import { FirestoreUserRepository } from './firebase/firestore/user-repository.firestore'
import { FirestoreCategoryRepository } from './firebase/firestore/category-repository.firestore'
import { FirestoreProductRepository } from './firebase/firestore/product-repository.firestore'
import { FirestoreReviewRepository } from './firebase/firestore/review-repository.firestore'
import { FirestoreReportRepository } from './firebase/firestore/report-repository.firestore'
import { FirestoreVoteRepository } from './firebase/firestore/vote-repository.firestore'

import { AuthService as AuthServiceImpl } from '@/core/usecases/auth-service'
import { CatalogService as CatalogServiceImpl } from '@/core/usecases/catalog-service'
import { ProductService as ProductServiceImpl } from '@/core/usecases/product-service'
import { ModerationService as ModerationServiceImpl } from '@/core/usecases/moderation-service'
import { ReviewService as ReviewServiceImpl, VoteService as VoteServiceImpl } from '@/core/usecases/review-service'

interface Services {
  auth: AuthService
  catalog: CatalogService
  products: ProductService
  moderation: ModerationService
  reviews: ReviewService
  votes: VoteService
}

let instance: Services | null = null

export function getServices(): Services {
  if (instance) return instance

  const authGateway = new FirebaseAuthGateway()
  const userRepo = new FirestoreUserRepository()
  const categoryRepo = new FirestoreCategoryRepository()
  const productRepo = new FirestoreProductRepository()
  const reviewRepo = new FirestoreReviewRepository()
  const voteRepo = new FirestoreVoteRepository()
  const reportRepo = new FirestoreReportRepository()
  const reviewService = new ReviewServiceImpl(reviewRepo, productRepo)

  instance = {
    auth: new AuthServiceImpl(authGateway, userRepo),
    catalog: new CatalogServiceImpl(productRepo, categoryRepo),
    products: new ProductServiceImpl(productRepo, categoryRepo),
    moderation: new ModerationServiceImpl(reportRepo, categoryRepo, reviewService),
    reviews: reviewService,
    votes: new VoteServiceImpl(voteRepo, reviewRepo),
  }
  return instance
}
