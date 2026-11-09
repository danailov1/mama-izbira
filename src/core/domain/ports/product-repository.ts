import type { NewProduct, Product, ProductStatus } from '../entities/product'

export interface ProductQuery {
  categoryId?: string
  search?: string
  minRating?: number
  status?: ProductStatus
  sort?: 'newest' | 'top' | 'rating'
  limit?: number
  /** id на последния зареден документ — за cursor-based пагинация. */
  cursorId?: string
}

export interface PublicStats {
  products: number
  reviews: number
}

export interface ProductRepository {
  query(query: ProductQuery): Promise<Product[]>
  getById(id: string): Promise<Product | null>
  subscribeById(id: string, cb: (product: Product | null) => void): () => void
  create(product: NewProduct, userId: string): Promise<Product>
  setStatus(id: string, status: ProductStatus, rejectionReason?: string): Promise<void>
  /**
   * Bounded set of approved products used for local fuzzy scoring (duplicate
   * detection / suggestions). Does not depend on `searchName`, so it also sees
   * legacy documents created before that field existed.
   */
  listForMatching(limit?: number): Promise<Product[]>
  subscribeMine(userId: string, cb: (products: Product[]) => void): () => void
  subscribePending(cb: (products: Product[]) => void): () => void
  subscribeAll(cb: (products: Product[]) => void): () => void
  getPublicStats(): Promise<PublicStats>
}
