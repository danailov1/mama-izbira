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

/** Нормализира текст за търсене: малки букви, без диакритика и пунктуация. */
export function normalizeName(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9а-я]+/gi, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

/** Нормализиран низ за range/prefix заявки в Firestore (`brand model`). */
export function searchNameOf(brand: string, model: string): string {
  return normalizeName(`${brand} ${model}`)
}
