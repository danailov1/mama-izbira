import type { Report } from '../entities/review'

export interface ReportRepository {
  subscribeAll(cb: (reports: Report[]) => void): () => void
  markHandled(id: string, moderatorId: string): Promise<void>
}
