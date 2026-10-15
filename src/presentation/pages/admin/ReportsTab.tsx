import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Product } from '@/core/domain/entities/product'
import type { Report, Review } from '@/core/domain/entities/review'
import { getServices } from '@/infra/di'
import { useAuth } from '@/presentation/auth/AuthContext'
import { Msr } from '@/presentation/components/ui/Msr'
import { EmptyState } from '@/presentation/components/ui/EmptyState'
import { useToast } from '@/presentation/components/ui/Toast'
import { timeAgo } from '@/presentation/lib/format'

interface ReportExtra {
  product?: Product | null
  review?: Review | null
}

export function ReportsTab() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [reports, setReports] = useState<Report[]>([])
  const [extras, setExtras] = useState<Record<string, ReportExtra>>({})
  const [filter, setFilter] = useState<'all' | 'new'>('new')
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    return getServices().moderation.subscribeReports(setReports)
  }, [])

  useEffect(() => {
    const missing: Report[] = []
    reports.forEach((r) => {
      const extra = extras[r.id]
      if (!extra || !('product' in extra) || !('review' in extra)) missing.push(r)
    })
    if (missing.length === 0) return
    let active = true
    missing.forEach((r) => {
      getServices()
        .catalog.getProduct(r.productId)
        .then((p) => {
          if (!active) return
          setExtras((prev) => ({ ...prev, [r.id]: { ...prev[r.id], product: p } }))
          return getServices().reviews.getMyReview(r.productId, r.reviewId)
        })
        .then((rev) => {
          if (!active) return
          setExtras((prev) => ({ ...prev, [r.id]: { ...prev[r.id], review: rev } }))
        })
        .catch(() => {})
    })
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reports])

  const visible = reports
    .filter((r) => (filter === 'new' ? r.status === 'new' : true))
    .sort((a, b) => (a.status === b.status ? b.createdAt - a.createdAt : a.status === 'new' ? -1 : 1))

  const markHandled = async (r: Report) => {
    setBusyId(r.id)
    try {
      await getServices().moderation.markHandled(r.id, user!)
      showToast('Докладът е отбелязан като обработен')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Грешка', 'error')
    } finally {
      setBusyId(null)
    }
  }

  const removeReview = async (r: Report) => {
    const extra = extras[r.id]
    const title = extra?.product ? `${extra.product.brand} ${extra.product.model}` : 'продукта'
    if (!window.confirm(`Премахване на докладваното ревю от ${title}? Действието е необратимо.`)) return
    setBusyId(r.id)
    try {
      await getServices().moderation.removeReportedReview(r, user!)
      showToast('Ревюто е премахнато, докладът е затворен', 'delete')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Грешка', 'error')
    } finally {
      setBusyId(null)
    }
  }

  if (visible.length === 0) {
    return (
      <EmptyState
        icon="flag"
        title={filter === 'new' ? 'Няма нови доклади' : 'Няма доклади'}
        text="Когато потребител докладва ревю, то ще се появи тук."
      />
    )
  }

  return (
    <div className="stack">
      <div className="filter-row" style={{ marginTop: 0 }}>
        <button
          className={`btn btn-ghost btn-sm ${filter === 'new' ? 'active' : ''}`}
          style={filter === 'new' ? { borderColor: 'var(--berry)', color: 'var(--berry)' } : undefined}
          onClick={() => setFilter('new')}
        >
          <Msr icon="notifications" size="sm" />
          Нови
        </button>
        <button
          className={`btn btn-ghost btn-sm ${filter === 'all' ? 'active' : ''}`}
          style={filter === 'all' ? { borderColor: 'var(--berry)', color: 'var(--berry)' } : undefined}
          onClick={() => setFilter('all')}
        >
          <Msr icon="inbox" size="sm" />
          Всички
        </button>
      </div>

      {visible.map((r) => {
        const extra = extras[r.id]
        const review = extra?.review
        const product = extra?.product
        const reviewRemoved = review?.status === 'removed'
        return (
          <div key={r.id} className="review-card">
            <div className="avatar">
              <Msr icon="flag" size="sm" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <div>
                  <span className="review-name">
                    {product ? (
                      <Link to={`/products/${r.productId}`}>
                        {product.brand} {product.model}
                      </Link>
                    ) : (
                      'Продукт…'
                    )}
                  </span>
                  <div className="review-meta">
                    {timeAgo(r.createdAt)} · {reviewRemoved ? 'ревюто вече е премахнато' : 'чака решение'}
                  </div>
                </div>
                <span className={`badge ${r.status === 'new' ? 'badge-pending' : 'badge-approved'}`}>
                  <Msr icon={r.status === 'new' ? 'schedule' : 'check_circle'} size="sm" />
                  {r.status === 'new' ? 'Нов' : 'Обработен'}
                </span>
              </div>

              <div
                style={{
                  background: 'var(--oat)',
                  borderRadius: 12,
                  padding: '10px 14px',
                  margin: '10px 0',
                  fontSize: 13,
                }}
              >
                <b style={{ fontSize: 12, color: 'var(--berry)' }}>Причина: </b>
                {r.reason}
                {review && (
                  <div style={{ marginTop: 6, color: 'var(--grey)' }}>
                    <b>Ревю: </b>
                    {review.status === 'visible'
                      ? `${'★'.repeat(review.rating)} · ${review.text.slice(0, 120)}${review.text.length > 120 ? '…' : ''}`
                      : 'ревюто не е налично'}
                  </div>
                )}
              </div>

              {r.status === 'new' && (
                <div className="row">
                  <button
                    className="btn btn-danger btn-sm"
                    disabled={busyId === r.id}
                    onClick={() => removeReview(r)}
                  >
                    <Msr icon="delete" size="sm" />
                    Премахни ревюто
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={busyId === r.id}
                    onClick={() => markHandled(r)}
                  >
                    <Msr icon="done" size="sm" />
                    Без действие
                  </button>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
