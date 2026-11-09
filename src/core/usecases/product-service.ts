import type { NewProduct, Product } from '../domain/entities/product'
import { normalizeName, productTitle } from '../domain/entities/product'
import type { CategoryRepository } from '../domain/ports/category-repository'
import type { ProductRepository, PublicStats } from '../domain/ports/product-repository'
import type { TextMatcher } from '../domain/ports/text-matcher'
import type { AppUser } from '../domain/entities/user'
import { DomainError, isModerator } from './auth-service'

const DUPLICATE_SCORE = 0.92
const DUPLICATE_CANDIDATES = 500
const SUGGESTION_CANDIDATES = 50
const SUGGESTION_MIN_SCORE = 0.2

export interface DuplicateSuggestion {
  product: Product
  score: number
}

export class ProductService {
  constructor(
    private readonly products: ProductRepository,
    private readonly categories: CategoryRepository,
    private readonly matcher: TextMatcher,
  ) {}

  /**
   * First token of the brand (or model) — used as the Firestore `searchName`
   * prefix so fuzzy scoring only ever sees a bounded candidate set.
   */
  private namePrefix(brand: string, model: string): string {
    return normalizeName(brand).split(' ')[0] || normalizeName(model).split(' ')[0]
  }

  private async candidates(brand: string, model: string, limit: number): Promise<Product[]> {
    const prefix = this.namePrefix(brand, model)
    if (!prefix) return []
    return this.products.query({ status: 'approved', search: prefix, limit })
  }

  subscribeMine(userId: string, cb: (products: Product[]) => void): () => void {
    return this.products.subscribeMine(userId, cb)
  }

  subscribePending(cb: (products: Product[]) => void): () => void {
    return this.products.subscribePending(cb)
  }

  subscribeAll(cb: (products: Product[]) => void): () => void {
    return this.products.subscribeAll(cb)
  }

  getPublicStats(): Promise<PublicStats> {
    return this.products.getPublicStats()
  }

  private validateCategory(categoryId: string): Promise<boolean> {
    return this.categories.byId(categoryId).then((c) => c !== null && c.status === 'active')
  }

  async addProduct(input: NewProduct, user: AppUser): Promise<Product> {
    if (!user) throw new DomainError('auth_required', 'Трябва да си влязъл, за да добавиш продукт.')
    const brand = input.brand.trim()
    const model = input.model.trim()
    if (brand.length < 2) throw new DomainError('invalid_brand', 'Марката трябва да е поне 2 символа.')
    if (model.length < 2) throw new DomainError('invalid_model', 'Моделът трябва да е поне 2 символа.')
    if (!(await this.validateCategory(input.categoryId)))
      throw new DomainError('invalid_category', 'Избери валидна категория.')

    const imageUrl = input.imageUrl?.trim()
    if (imageUrl) {
      let valid = false
      try {
        const parsed = new URL(imageUrl)
        valid = parsed.protocol === 'http:' || parsed.protocol === 'https:'
      } catch {
        valid = false
      }
      if (!valid)
        throw new DomainError('invalid_image', 'Линкът към снимката трябва да започва с http:// или https://.')
    }

    const query = `${brand} ${model}`
    const candidates = await this.candidates(brand, model, DUPLICATE_CANDIDATES)
    if (candidates.length > 0) {
      const matches = await this.matcher.analyze(query, candidates.map(productTitle))
      const duplicateIndex = matches.findIndex(
        (m) => m.exact || m.compactMatch || m.score >= DUPLICATE_SCORE,
      )
      if (duplicateIndex >= 0) {
        const existing = candidates[duplicateIndex]
        throw new DomainError(
          'duplicate',
          `Продуктът "${existing.brand} ${existing.model}" вече съществува в каталога.`,
        )
      }
    }

    return this.products.create(
      {
        brand,
        model,
        categoryId: input.categoryId,
        imageUrl,
      },
      user.id,
    )
  }

  async suggestDuplicates(brand: string, model: string): Promise<DuplicateSuggestion[]> {
    const query = `${brand} ${model}`.trim()
    if (query.length < 3) return []
    const candidates = await this.candidates(brand, model, SUGGESTION_CANDIDATES)
    if (candidates.length === 0) return []
    const matches = await this.matcher.analyze(query, candidates.map(productTitle))
    return candidates
      .map((product, i) => ({ product, score: matches[i].score }))
      .filter((s) => s.score > SUGGESTION_MIN_SCORE)
      .sort((a, b) => b.score - a.score || b.product.reviewsCount - a.product.reviewsCount)
      .slice(0, 5)
  }

  async approve(productId: string, moderator: AppUser): Promise<void> {
    this.assertModerator(moderator)
    await this.products.setStatus(productId, 'approved')
  }

  async reject(productId: string, reason: string, moderator: AppUser): Promise<void> {
    this.assertModerator(moderator)
    if (reason.trim().length < 3)
      throw new DomainError('invalid_reason', 'Причините за отхвърляне трябва да са поне 3 символа.')
    await this.products.setStatus(productId, 'rejected', reason.trim())
  }

  private assertModerator(user: AppUser | null): void {
    if (!user) throw new DomainError('auth_required', 'Изисква се влизане в профила.')
    if (!isModerator(user))
      throw new DomainError('forbidden', 'Само модератори могат да изпълнят това действие.')
  }
}
