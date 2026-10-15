import type { Category } from '../entities/category'

export interface NewCategory {
  name: string
  icon: string
}

export type CategoryPatch = Partial<Pick<Category, 'name' | 'icon' | 'status' | 'order'>>

export interface CategoryRepository {
  listAll(): Promise<Category[]>
  subscribe(cb: (categories: Category[]) => void): () => void
  byId(id: string): Promise<Category | null>
  createCategory(input: NewCategory): Promise<Category>
  updateCategory(id: string, patch: CategoryPatch): Promise<void>
}
