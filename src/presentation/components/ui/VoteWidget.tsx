import { useEffect, useState } from 'react'
import type { VoteType } from '@/core/domain/entities/review'
import { getServices } from '@/infra/di'
import { Msr } from './Msr'
import { useAuth } from '@/presentation/auth/AuthContext'

export function VoteWidget({
  productId,
  reviewId,
  netScore,
  canVote,
  onRequireAuth,
}: {
  productId: string
  reviewId: string
  netScore: number
  canVote: boolean
  onRequireAuth: () => void
}) {
  const { user } = useAuth()
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
      await getServices().votes.toggle(productId, reviewId, type, user)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="vote" aria-label={`Резултат ${netScore} гласа`}>
      <button
        className={`up ${myVote === 'up' ? 'voted' : ''}`}
        onClick={() => handleVote('up')}
        disabled={busy}
        aria-label="Полезно ревю"
        title="Полезно"
      >
        <Msr icon="arrow_upward" size="sm" fill={myVote === 'up'} />
      </button>
      <span className="vote-count">{netScore}</span>
      <button
        className={`down ${myVote === 'down' ? 'voted' : ''}`}
        onClick={() => handleVote('down')}
        disabled={busy}
        aria-label="Неполезно ревю"
        title="Неполезно"
      >
        <Msr icon="arrow_downward" size="sm" fill={myVote === 'down'} />
      </button>
    </div>
  )
}
