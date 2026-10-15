import type { NewProduct, Product } from '../domain/entities/product'
import type { CategoryRepository } from '../domain/ports/category-repository'
import type { ProductRepository } from '../domain/ports/product-repository'
import type { AppUser } from '../domain/entities/user'
import { DomainError, isModerator } from './auth-service'

export interface DuplicateSuggestion {
  product: Product
  score: number
}

export class ProductService {
  constructor(
    private readonly products: ProductRepository,
    private readonly categories: CategoryRepository,
  ) {}

  subscribeMine(userId: string, cb: (products: Product[]) => void): () => void {
    return this.products.subscribeMine(userId, cb)
  }

  subscribePending(cb: (products: Product[]) => void): () => void {
    return this.products.subscribePending(cb)
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

    const dupes = await this.products.searchDuplicates(brand, model)
    if (dupes.length > 0) {
      const existing = dupes.find((p) => p.status === 'approved') ?? dupes[0]
      throw new DomainError(
        'duplicate',
        `Продуктът "${existing.brand} ${existing.model}" вече съществува в каталога.`,
      )
    }

    return this.products.create(
      {
        brand,
        model,
        categoryId: input.categoryId,
        imageUrl: input.imageUrl,
      },
      user.id,
    )
  }

  async suggestDuplicates(brand: string, model: string): Promise<DuplicateSuggestion[]> {
    const q = `${brand} ${model}`.trim()
    if (q.length < 3) return []
    const results = await this.products.query({ status: 'approved', search: q, limit: 5 })
    return results.map((product) => ({ product, score: 1 }))
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
