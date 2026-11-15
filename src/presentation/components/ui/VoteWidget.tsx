import { useEffect, useState } from 'react'
import type { VoteType } from '@/core/domain/entities/review'
import { getServices } from '@/infra/di'
import { Msr } from './Msr'
import { useAuth } from '@/presentation/auth/AuthContext'
import { useToast } from './Toast'

export function VoteWidget({
  productId,
  reviewId,
  upvotes,
  downvotes,
  canVote,
  onRequireAuth,
}: {
  productId: string
  reviewId: string
  upvotes: number
  downvotes: number
  canVote: boolean
  onRequireAuth: () => void
}) {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [myVote, setMyVote] = useState<VoteType | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    if (!user) {
      setMyVote(null)
      return
    }
    getServices()
      .votes.getMyVote(productId, reviewId, user.id)
      .then((v) => active && setMyVote(v?.type ?? null))
      .catch(() => active && setMyVote(null))
    return () => {
      active = false
    }
  }, [user, productId, reviewId])

  const handleVote = async (type: VoteType) => {
    if (!canVote) {
      onRequireAuth()
      return
    }
    if (!user || busy) return
    setBusy(true)
    try {
      const next = await getServices().votes.toggle(productId, reviewId, type, user)
      setMyVote(next)
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Гласът не беше записан', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="vote" role="group" aria-label="Полезност на ревюто">
      <button
        type="button"
        className={`vote-btn up ${myVote === 'up' ? 'voted' : ''}`}
        onClick={() => handleVote('up')}
        disabled={busy}
        aria-pressed={myVote === 'up'}
        aria-label={`Харесва ми, ${upvotes} ${upvotes === 1 ? 'глас' : 'гласа'}`}
        title="Харесва ми"
      >
        <Msr icon="thumb_up" size="sm" />
        <span className="vote-count" aria-live="polite">
          {upvotes}
        </span>
      </button>
      <button
        type="button"
        className={`vote-btn down ${myVote === 'down' ? 'voted' : ''}`}
        onClick={() => handleVote('down')}
        disabled={busy}
        aria-pressed={myVote === 'down'}
        aria-label={`Не ми харесва, ${downvotes} ${downvotes === 1 ? 'глас' : 'гласа'}`}
        title="Не ми харесва"
      >
        <Msr icon="thumb_down" size="sm" />
        <span className="vote-count" aria-live="polite">
          {downvotes}
        </span>
      </button>
    </div>
  )
}
