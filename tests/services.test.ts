import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Category } from '../src/core/domain/entities/category'
import {
  normalizeName,
  searchNameOf,
} from '../src/core/domain/entities/product'
import type { NewProduct, Product, ProductStatus } from '../src/core/domain/entities/product'
import type { NewReview, Report, Review, Vote, VoteType } from '../src/core/domain/entities/review'
import type { AppUser } from '../src/core/domain/entities/user'
import type { CategoryRepository } from '../src/core/domain/ports/category-repository'
import type { ProductRepository, PublicStats } from '../src/core/domain/ports/product-repository'
import type { ReviewRepository } from '../src/core/domain/ports/review-repository'
import type { VoteRepository } from '../src/core/domain/ports/vote-repository'
import { ProductService } from '../src/core/usecases/product-service'
import { ReviewService, VoteService } from '../src/core/usecases/review-service'
import { DomainError } from '../src/core/usecases/auth-service'
import { JsTextMatcher } from '../src/infra/wasm/text-matcher.fallback'

const matcher = new JsTextMatcher()

const user = (id: string, role: AppUser['role'] = 'user'): AppUser => ({
  id,
  displayName: id,
  email: `${id}@example.com`,
  role,
  createdAt: 0,
})

const product = (id: string, overrides: Partial<Product> = {}): Product => ({
  id,
  brand: 'Chicco',
  model: 'Next2Me',
  categoryId: 'cat1',
  status: 'approved',
  createdBy: 'author',
  createdAt: 1,
  avgRating: 0,
  reviewsCount: 0,
  ...overrides,
})

const review = (productId: string, userId: string, overrides: Partial<Review> = {}): Review => ({
  id: userId,
  productId,
  userId,
  rating: 5,
  text: 'Много полезно ревю за родители',
  upvotes: 0,
  downvotes: 0,
  netScore: 0,
  status: 'visible',
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
})

class FakeCategoryRepository implements CategoryRepository {
  categories: Category[] = [
    { id: 'cat1', name: 'Столчета', slug: 'stolcheta', icon: 'chair', order: 0, status: 'active' },
  ]
  listAll = async () => this.categories
  subscribe = () => () => {}
  byId = async (id: string) => this.categories.find((c) => c.id === id) ?? null
  createCategory = async () => {
    throw new Error('not implemented')
  }
  updateCategory = async () => {}
}

class FakeProductRepository implements ProductRepository {
  products: Product[] = []
  query = async () => this.products
  getById = async (id: string) => this.products.find((p) => p.id === id) ?? null
  subscribeById = () => () => {}
  create = async (input: NewProduct, userId: string) => {
    const p = product(`p${this.products.length + 1}`, {
      ...input,
      createdBy: userId,
      status: 'pending',
      createdAt: 2,
    })
    this.products.push(p)
    return p
  }
  setStatus = async (id: string, status: ProductStatus) => {
    const p = this.products.find((x) => x.id === id)
    if (p) p.status = status
  }
  subscribeMine = () => () => {}
  subscribePending = () => () => {}
  subscribeAll = () => () => {}
  listForMatching = async (limit = 500) =>
    this.products.filter((p) => p.status === 'approved').slice(0, limit)
  getPublicStats = async (): Promise<PublicStats> => ({ products: this.products.length, reviews: 0 })
}

class FakeReviewRepository implements ReviewRepository {
  reviews: Review[] = []
  reports: Report[] = []
  getByProductAndUser = async (productId: string, userId: string) =>
    this.reviews.find((r) => r.productId === productId && r.id === userId) ?? null
  getById = async (productId: string, reviewId: string) =>
    this.reviews.find((r) => r.productId === productId && r.id === reviewId) ?? null
  listByProduct = async (productId: string) => this.reviews.filter((r) => r.productId === productId)
  subscribeByProduct = () => () => {}
  create = async (input: NewReview, userId: string) => {
    const r = review(input.productId, userId, { rating: input.rating, text: input.text })
    this.reviews.push(r)
    return r
  }
  update = async (productId: string, reviewId: string, rating: number, text: string) => {
    const r = this.reviews.find((x) => x.productId === productId && x.id === reviewId)
    if (r) {
      r.rating = rating
      r.text = text
    }
  }
  remove = async (productId: string, reviewId: string) => {
    this.reviews = this.reviews.filter((r) => !(r.productId === productId && r.id === reviewId))
  }
  setRemoved = async (productId: string, reviewId: string) => {
    const r = this.reviews.find((x) => x.productId === productId && x.id === reviewId)
    if (r) r.status = 'removed'
  }
  subscribeMine = () => () => {}
  createReport = async (input: Omit<Report, 'id' | 'createdAt'>) => {
    this.reports.push({ ...input, id: `rep${this.reports.length + 1}`, createdAt: 1 })
  }
}

class FakeVoteRepository implements VoteRepository {
  votes: Vote[] = []
  getForReview = async (productId: string, reviewId: string, userId: string) =>
    this.votes.find((v) => v.reviewId === reviewId && v.userId === userId) ?? null
  cast = async (_productId: string, reviewId: string, userId: string, type: VoteType) => {
    this.votes = this.votes.filter((v) => !(v.reviewId === reviewId && v.userId === userId))
    this.votes.push({ id: userId, reviewId, userId, type, createdAt: 1 })
  }
  clear = async (_productId: string, reviewId: string, userId: string) => {
    this.votes = this.votes.filter((v) => !(v.reviewId === reviewId && v.userId === userId))
  }
}

async function expectDomainError(fn: () => Promise<unknown>, code: string) {
  await assert.rejects(fn, (err: unknown) => err instanceof DomainError && err.code === code)
}

describe('Product name normalization', () => {
  it('normalizes case, punctuation and diacritics', () => {
    assert.equal(normalizeName('  Chicco—Next2Me! '), 'chicco next2me')
    assert.equal(searchNameOf('Chicco', 'Next 2 Me'), 'chicco next 2 me')
  })

  it('treats spacing variants as the same product', async () => {
    const [match] = await matcher.analyze('Chicco Next 2 Me', ['Chicco Next2Me'])
    assert.equal(match.compactMatch, true)
    assert.equal(match.score, 1)

    const [fuzzy] = await matcher.analyze('Chicco Next 2 Me', ['Chicco Next2Me Magic'])
    assert.ok(fuzzy.score >= 0.9, `expected a strong match, got ${fuzzy.score}`)
  })
})

describe('ReviewService', () => {
  it('rejects invalid ratings and short text', async () => {
    const products = new FakeProductRepository()
    products.products = [product('p1')]
    const reviews = new FakeReviewRepository()
    const service = new ReviewService(reviews, products)

    await expectDomainError(() => service.addReview({ productId: 'p1', rating: 0, text: 'достатъчно дълго' }, user('u1')), 'invalid_rating')
    await expectDomainError(() => service.addReview({ productId: 'p1', rating: 5, text: 'кратко' }, user('u1')), 'invalid_text')
  })

  it('only allows reviews for approved existing products', async () => {
    const products = new FakeProductRepository()
    products.products = [product('p1', { status: 'pending' })]
    const reviews = new FakeReviewRepository()
    const service = new ReviewService(reviews, products)

    await expectDomainError(() => service.addReview({ productId: 'missing', rating: 5, text: 'достатъчно дълго' }, user('u1')), 'not_found')
    await expectDomainError(() => service.addReview({ productId: 'p1', rating: 5, text: 'достатъчно дълго' }, user('u1')), 'not_approved')
  })

  it('prevents duplicate, self-report and foreign edits', async () => {
    const products = new FakeProductRepository()
    products.products = [product('p1')]
    const reviews = new FakeReviewRepository()
    reviews.reviews = [review('p1', 'u1')]
    const service = new ReviewService(reviews, products)

    await expectDomainError(() => service.addReview({ productId: 'p1', rating: 5, text: 'достатъчно дълго' }, user('u1')), 'already_reviewed')
    await expectDomainError(() => service.reportReview('p1', 'u1', 'спам и обида', user('u1')), 'self_report')
    await expectDomainError(() => service.updateReview('p1', 'u1', 4, 'нов текст за ревюто', 'u2'), 'forbidden')
    await assert.doesNotReject(() => service.updateReview('p1', 'u1', 4, 'нов текст за ревюто', 'u1'))
  })
})

describe('VoteService', () => {
  it('toggles votes and returns the resulting state', async () => {
    const reviews = new FakeReviewRepository()
    reviews.reviews = [review('p1', 'author')]
    const votes = new FakeVoteRepository()
    const service = new VoteService(votes, reviews)
    const voter = user('voter')

    assert.equal(await service.toggle('p1', 'author', 'up', voter), 'up')
    assert.equal(votes.votes[0].type, 'up')
    assert.equal(await service.toggle('p1', 'author', 'up', voter), null)
    assert.equal(votes.votes.length, 0)
    assert.equal(await service.toggle('p1', 'author', 'down', voter), 'down')
    assert.equal(votes.votes[0].type, 'down')
  })

  it('forbids self-votes and votes on removed reviews', async () => {
    const reviews = new FakeReviewRepository()
    reviews.reviews = [review('p1', 'author'), review('p1', 'gone', { status: 'removed' })]
    const service = new VoteService(new FakeVoteRepository(), reviews)

    await expectDomainError(() => service.toggle('p1', 'author', 'up', user('author')), 'self_vote')
    await expectDomainError(() => service.toggle('p1', 'gone', 'up', user('voter')), 'not_found')
  })
})

describe('ProductService', () => {
  it('validates image URL protocol', async () => {
    const products = new FakeProductRepository()
    const service = new ProductService(products, new FakeCategoryRepository(), matcher)

    await expectDomainError(
      () => service.addProduct({ brand: 'Chicco', model: 'Best Friend', categoryId: 'cat1', imageUrl: 'javascript:alert(1)' }, user('u1')),
      'invalid_image',
    )
    const created = await service.addProduct(
      { brand: 'Chicco', model: 'Best Friend', categoryId: 'cat1', imageUrl: 'https://example.com/a.jpg' },
      user('u1'),
    )
    assert.equal(created.status, 'pending')
  })

  it('rejects duplicate products (case-insensitive)', async () => {
    const products = new FakeProductRepository()
    products.products = [product('p1', { brand: 'Chicco', model: 'Best Friend' })]
    const service = new ProductService(products, new FakeCategoryRepository(), matcher)

    await expectDomainError(
      () => service.addProduct({ brand: 'chicco', model: 'best friend', categoryId: 'cat1' }, user('u1')),
      'duplicate',
    )
  })

  it('flags "lego duplo-farm" against an existing LEGO / DUPLO Farm', async () => {
    const products = new FakeProductRepository()
    products.products = [product('p1', { brand: 'LEGO', model: 'DUPLO Farm' })]
    const service = new ProductService(products, new FakeCategoryRepository(), matcher)

    await expectDomainError(
      () => service.addProduct({ brand: 'lego', model: 'duplo-farm', categoryId: 'cat1' }, user('u1')),
      'duplicate',
    )
  })

  it('includes the matched product in the duplicate error so the UI can suggest it', async () => {
    const products = new FakeProductRepository()
    products.products = [product('p1', { brand: 'LEGO', model: 'DUPLO Farm' })]
    const service = new ProductService(products, new FakeCategoryRepository(), matcher)

    await assert.rejects(
      () => service.addProduct({ brand: 'lego', model: 'duplo-farm', categoryId: 'cat1' }, user('u1')),
      (error: unknown) => {
        assert.ok(error instanceof DomainError)
        assert.equal(error.code, 'duplicate')
        const details = error.details as { product?: Product }
        assert.equal(details.product?.id, 'p1')
        return true
      },
    )
  })

  it('suggests the existing product while the user is typing', async () => {
    const products = new FakeProductRepository()
    products.products = [product('p1', { brand: 'LEGO', model: 'DUPLO Farm' })]
    const service = new ProductService(products, new FakeCategoryRepository(), matcher)

    const suggestions = await service.suggestDuplicates('lego', 'duplo-farm')
    assert.equal(suggestions[0]?.product.id, 'p1')
    assert.ok(suggestions[0].score > 0.5, `expected a strong suggestion, got ${suggestions[0]?.score}`)
  })

  it('requires valid category and brand/model lengths', async () => {
    const service = new ProductService(new FakeProductRepository(), new FakeCategoryRepository(), matcher)
    await expectDomainError(() => service.addProduct({ brand: 'C', model: 'Best Friend', categoryId: 'cat1' }, user('u1')), 'invalid_brand')
    await expectDomainError(() => service.addProduct({ brand: 'Chicco', model: 'Best Friend', categoryId: 'unknown' }, user('u1')), 'invalid_category')
  })
})
