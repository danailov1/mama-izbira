import type { Category } from '../domain/entities/category'
import type { Report } from '../domain/entities/review'
import type { AppUser } from '../domain/entities/user'
import type { ReportRepository } from '../domain/ports/report-repository'
import type { CategoryRepository, NewCategory } from '../domain/ports/category-repository'
import { DomainError, isAdmin, isModerator } from './auth-service'
import type { ReviewService } from './review-service'

export class ModerationService {
  constructor(
    private readonly reports: ReportRepository,
    private readonly categories: CategoryRepository,
    private readonly reviews: ReviewService,
  ) {}

  subscribeReports(cb: (reports: Report[]) => void): () => void {
    return this.reports.subscribeAll(cb)
  }

  subscribeCategories(cb: (categories: Category[]) => void): () => void {
    return this.categories.subscribe(cb)
  }

  async markHandled(reportId: string, moderator: AppUser): Promise<void> {
    this.assertModerator(moderator)
    await this.reports.markHandled(reportId, moderator.id)
  }

  async removeReportedReview(report: Report, moderator: AppUser): Promise<void> {
    this.assertModerator(moderator)
    await this.reviews.moderateRemove(report.productId, report.reviewId, moderator)
    await this.reports.markHandled(report.id, moderator.id)
  }

  async addCategory(input: NewCategory, admin: AppUser): Promise<Category> {
    this.assertAdmin(admin)
    if (input.name.trim().length < 2)
      throw new DomainError('invalid_name', 'Името на категорията трябва да е поне 2 символа.')
    if (!input.icon.trim())
      throw new DomainError('invalid_icon', 'Избери икона за категорията.')
    return this.categories.createCategory(input)
  }

  async setCategoryStatus(id: string, status: 'active' | 'archived', admin: AppUser): Promise<void> {
    this.assertAdmin(admin)
    await this.categories.updateCategory(id, { status })
  }

  private assertModerator(user: AppUser | null): void {
    if (!user) throw new DomainError('auth_required', 'Изисква се влизане в профила.')
    if (!isModerator(user))
      throw new DomainError('forbidden', 'Само модератори могат да изпълнят това действие.')
  }

  private assertAdmin(user: AppUser | null): void {
    if (!user) throw new DomainError('auth_required', 'Изисква се влизане в профила.')
    if (!isAdmin(user))
      throw new DomainError('forbidden', 'Само администратори могат да променят категориите.')
  }
}
