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

/** Сравнение без интервали — хваща „Next2Me“ срещу „Next 2 Me“. */
export function compactName(input: string): string {
  return normalizeName(input).replace(/\s+/g, '')
}

/** Jaccard сходство между токените на две имена (0..1). */
export function tokenSimilarity(a: string, b: string): number {
  const at = new Set(normalizeName(a).split(' ').filter(Boolean))
  const bt = new Set(normalizeName(b).split(' ').filter(Boolean))
  if (at.size === 0 || bt.size === 0) return 0
  let intersection = 0
  at.forEach((t) => {
    if (bt.has(t)) intersection++
  })
  const union = at.size + bt.size - intersection
  return union === 0 ? 0 : intersection / union
}
