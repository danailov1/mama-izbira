import type { NewProduct, Product, ProductStatus } from '../entities/product'

export interface ProductQuery {
  categoryId?: string
  search?: string
  minRating?: number
  status?: ProductStatus
  sort?: 'newest' | 'top' | 'rating'
  limit?: number
}

export interface ProductRepository {
  query(query: ProductQuery): Promise<Product[]>
  getById(id: string): Promise<Product | null>
  subscribeById(id: string, cb: (product: Product | null) => void): () => void
  create(product: NewProduct, userId: string): Promise<Product>
  setStatus(id: string, status: ProductStatus, rejectionReason?: string): Promise<void>
  searchDuplicates(brand: string, model: string): Promise<Product[]>
  subscribeMine(userId: string, cb: (products: Product[]) => void): () => void
  subscribePending(cb: (products: Product[]) => void): () => void
}
