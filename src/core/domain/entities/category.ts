export interface Category {
  id: string
  name: string
  slug: string
  icon: string
  order: number
  status: 'active' | 'archived'
}
