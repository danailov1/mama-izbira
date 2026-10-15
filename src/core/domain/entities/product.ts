export type ProductStatus = 'pending' | 'approved' | 'rejected'

export interface Product {
  id: string
  brand: string
  model: string
  categoryId: string
  imageUrl?: string
  status: ProductStatus
  rejectionReason?: string
  createdBy: string
  createdAt: number
  avgRating: number
  reviewsCount: number
}

export interface NewProduct {
  brand: string
  model: string
  categoryId: string
  imageUrl?: string
}

export function productTitle(p: Product): string {
  return `${p.brand} ${p.model}`
}
