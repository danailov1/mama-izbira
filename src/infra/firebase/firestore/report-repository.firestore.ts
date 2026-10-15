import {
  collection,
  doc,
  onSnapshot,
  query,
  orderBy,
  updateDoc,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import { getDb } from '../config'
import type { Report } from '@/core/domain/entities/review'
import type { ReportRepository } from '@/core/domain/ports/report-repository'

const toReport = (snap: QueryDocumentSnapshot): Report => {
  const d = snap.data()
  return {
    id: snap.id,
    productId: d.productId,
    reviewId: d.reviewId,
    userId: d.userId,
    reason: d.reason,
    status: d.status ?? 'new',
    handledBy: d.handledBy,
    handledAt: d.handledAt?.toMillis?.() ?? d.handledAt ?? 0,
    createdAt: d.createdAt?.toMillis?.() ?? d.createdAt ?? 0,
  }
}

export class FirestoreReportRepository implements ReportRepository {
  private db = getDb()
  private coll = collection(this.db, 'reports')

  subscribeAll(cb: (reports: Report[]) => void): () => void {
    const q = query(this.coll, orderBy('createdAt', 'desc'))
    return onSnapshot(
      q,
      (snap) => cb(snap.docs.map(toReport)),
      (err) => console.error('[firestore] reports.subscribeAll', err),
    )
  }

  async markHandled(id: string, moderatorId: string): Promise<void> {
    await updateDoc(doc(this.db, 'reports', id), {
      status: 'handled',
      handledBy: moderatorId,
      handledAt: new Date(),
    })
  }
}
