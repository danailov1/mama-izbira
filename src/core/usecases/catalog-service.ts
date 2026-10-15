import type { Category } from '../domain/entities/category'
import type { Product } from '../domain/entities/product'
import type { CategoryRepository } from '../domain/ports/category-repository'
import type { ProductQuery, ProductRepository } from '../domain/ports/product-repository'

export class CatalogService {
  constructor(
    private readonly products: ProductRepository,
    private readonly categories: CategoryRepository,
  ) {}

  async getCategories(): Promise<Category[]> {
    const all = await this.categories.listAll()
    return all.filter((c) => c.status === 'active').sort((a, b) => a.order - b.order)
  }

  subscribeCategories(cb: (categories: Category[]) => void): () => void {
    return this.categories.subscribe((all) =>
      cb(all.filter((c) => c.status === 'active').sort((a, b) => a.order - b.order)),
    )
  }

  getCategoryById(id: string): Promise<Category | null> {
    return this.categories.byId(id)
  }

  async getApproved(query: ProductQuery = {}): Promise<Product[]> {
    return this.products.query({ ...query, status: 'approved' })
  }

  getProduct(id: string): Promise<Product | null> {
    return this.products.getById(id)
  }

  subscribeProduct(id: string, cb: (product: Product | null) => void): () => void {
    return this.products.subscribeById(id, cb)
  }
}
