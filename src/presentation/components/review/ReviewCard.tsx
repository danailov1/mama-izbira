import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { Review } from '@/core/domain/entities/review'
import { useAuth } from '@/presentation/auth/AuthContext'
import { getServices } from '@/infra/di'
import { isModerator } from '@/core/usecases/auth-service'
import { initials, timeAgo } from '@/presentation/lib/format'
import { Stars } from '../ui/Stars'
import { VoteWidget } from '../ui/VoteWidget'
import { Modal } from '../ui/Modal'
import { Msr } from '../ui/Msr'
import { useToast } from '../ui/Toast'

export function ReviewCard({
  review,
  authorName,
  myReview = false,
  showProductLink = false,
  onChanged,
}: {
  review: Review
  authorName?: string
  myReview?: boolean
  showProductLink?: boolean
  onChanged?: () => void
}) {
  const { user, session } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [reporting, setReporting] = useState(false)
  const [reportReason, setReportReason] = useState('')
  const [removing, setRemoving] = useState(false)

  const services = getServices()
  const canVote = !!session && !myReview

  const requireAuth = () => {
    showToast('Влез в профила, за да гласуваш', 'info')
    navigate('/auth')
  }

  const submitReport = async () => {
    if (!user) return
    try {
      await services.reviews.reportReview(review.productId, review.id, reportReason, user)
      setReporting(false)
      setReportReason('')
      showToast('Благодарим — докладът е изпратен за преглед', 'flag')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Неуспешно докладване', 'error')
    }
  }

  const moderateRemove = async () => {
    if (!user) return
    if (!window.confirm('Премахване на това ревю? Действието е необратимо.')) return
    setRemoving(true)
    try {
      await services.reviews.moderateRemove(review.productId, review.id, user)
      showToast('Ревюто е премахнато', 'delete')
      onChanged?.()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Грешка', 'error')
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="review-card">
      <div className="avatar">{authorName ? initials(authorName) : 'Р'}</div>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <div>
            <span className="review-name">
              {showProductLink ? (
                <Link to={`/products/${review.productId}`}>продукт →</Link>
              ) : (
                authorName ?? 'Родител'
              )}
            </span>
            <div className="review-meta">{timeAgo(review.createdAt)}</div>
          </div>
          <Stars rating={review.rating} size="sm" />
        </div>
        <p className="review-text">{review.text}</p>
        <div className="review-foot">
          <VoteWidget
            productId={review.productId}
            reviewId={review.id}
            netScore={review.netScore}
            canVote={canVote}
            onRequireAuth={requireAuth}
          />
          <div className="review-actions">
            {!myReview && (
              <button className="btn btn-ghost btn-sm" onClick={() => setReporting(true)}>
                <Msr icon="flag" size="sm" />
                Докладвай
              </button>
            )}
            {myReview && (
              <>
                <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/products/${review.productId}?edit=my`)}>
                  <Msr icon="edit" size="sm" />
                  Редактирай
                </button>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={async () => {
                    if (!window.confirm('Изтриване на ревюто? Действието е необратимо.')) return
                    try {
                      await services.reviews.deleteReview(review.productId, review.id, user!.id)
                      showToast('Ревюто е изтрито', 'delete')
                      onChanged?.()
                    } catch (e) {
                      showToast(e instanceof Error ? e.message : 'Грешка', 'error')
                    }
                  }}
                >
                  <Msr icon="delete" size="sm" />
                  Изтрий
                </button>
              </>
            )}
            {!myReview && isModerator(user) && (
              <button className="btn btn-danger btn-sm" disabled={removing} onClick={moderateRemove}>
                <Msr icon="remove_circle" size="sm" />
                Премахни
              </button>
            )}
          </div>
        </div>
      </div>

      {reporting && (
        <Modal title="Докладвай ревю" onClose={() => setReporting(false)}>
          <p>Помогни ни да пазим качеството — опиши с какво е неподходящо съдържанието.</p>
          <div className="field">
            <label>Причина</label>
            <textarea
              rows={3}
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              placeholder="напр. спам, обидно съдържание, реклама..."
            />
          </div>
          <div className="row">
            <button className="btn btn-primary" onClick={submitReport}>
              <Msr icon="flag" size="sm" />
              Изпрати доклада
            </button>
            <button className="btn btn-ghost" onClick={() => setReporting(false)}>
              Отказ
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
