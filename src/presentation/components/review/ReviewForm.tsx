import { useState } from 'react'
import type { Review } from '@/core/domain/entities/review'
import { getServices } from '@/infra/di'
import { useAuth } from '@/presentation/auth/AuthContext'
import { DomainError } from '@/core/usecases/auth-service'
import { StarInput } from '../ui/Stars'
import { Msr } from '../ui/Msr'
import { useToast } from '../ui/Toast'

export function ReviewForm({
  productId,
  existing,
  onSaved,
  onCancel,
}: {
  productId: string
  existing?: Review | null
  onSaved: () => void
  onCancel?: () => void
}) {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [rating, setRating] = useState(existing?.rating ?? 0)
  const [text, setText] = useState(existing?.text ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setError(null)
    setBusy(true)
    try {
      if (existing) {
        await getServices().reviews.updateReview(productId, existing.id, rating, text, user!.id)
        showToast('Ревюто е обновено', 'edit')
      } else {
        await getServices().reviews.addReview({ productId, rating, text }, user!)
        showToast('Ревюто е публикувано успешно')
      }
      onSaved()
    } catch (e) {
      setError(e instanceof DomainError ? e.message : 'Нещо се обърка — опитай отново.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="form-card" style={{ maxWidth: '100%' }}>
      <h3 style={{ fontSize: 16 }}>{existing ? 'Редактирай ревюто' : 'Напиши ревю'}</h3>
      <div className="field">
        <label>Оценка</label>
        <StarInput value={rating} onChange={setRating} />
      </div>
      <div className="field">
        <label>Описание</label>
        <textarea
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Разкажи за опита си — употреба, качество, цена, за какво е подходящо..."
        />
        <p className="field-hint">
          <Msr icon="info" size="sm" />
          Поне 10 символа — така ревюто е полезно за другите родители.
        </p>
      </div>
      {error && (
        <p className="form-error">
          <Msr icon="error" size="sm" />
          {error}
        </p>
      )}
      <div className="row">
        <button className="btn btn-primary" onClick={submit} disabled={busy || rating === 0}>
          {busy ? <span className="spinner" /> : <Msr icon="send" size="sm" />}
          {existing ? 'Запази промените' : 'Публикувай ревюто'}
        </button>
        {onCancel && (
          <button className="btn btn-ghost" onClick={onCancel}>
            Отказ
          </button>
        )}
      </div>
    </div>
  )
}
