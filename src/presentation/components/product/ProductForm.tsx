import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Category } from '@/core/domain/entities/category'
import type { Product } from '@/core/domain/entities/product'
import { getServices } from '@/infra/di'
import { useAuth } from '@/presentation/auth/AuthContext'
import { DomainError } from '@/core/usecases/auth-service'
import { useDebounce } from '@/presentation/lib/useDebounce'
import { Msr } from '../ui/Msr'
import { useToast } from '../ui/Toast'
import { Alert } from '../ui/Alert'

function matchedProduct(error: unknown): Product | null {
  const details = (error as { details?: { product?: Product } } | null)?.details
  return details?.product ?? null
}

function describeSubmitError(error: unknown): string {
  const candidate = error as { code?: string; message?: string; name?: string } | null
  if (error instanceof DomainError || candidate?.name === 'DomainError') {
    return candidate?.message || 'Нещо се обърка при изпращането. Опитай отново.'
  }
  switch (candidate?.code) {
    case 'failed-precondition':
      return 'Проверката за дубликати временно не е налична. Опитай отново след минута.'
    case 'permission-denied':
      return 'Нямаш права да добавяш продукти. Провери дали профилът ти е активен.'
    case 'unavailable':
    case 'deadline-exceeded':
      return 'Няма връзка със сървъра. Провери интернет връзката и опитай отново.'
    default:
      return 'Нещо се обърка при изпращането. Опитай отново.'
  }
}

function reviewCountLabel(count: number): string {
  return `${count} ревю${count === 1 ? '' : 'та'}`
}

export function ProductForm({ categories }: { categories: Category[] }) {
  const { user } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()

  const [brand, setBrand] = useState('')
  const [model, setModel] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isDuplicate, setIsDuplicate] = useState(false)
  const [busy, setBusy] = useState(false)
  const [suggestions, setSuggestions] = useState<Product[]>([])
  const [showDuplicates, setShowDuplicates] = useState(false)

  const debouncedQuery = useDebounce(`${brand} ${model}`, 400)

  useEffect(() => {
    if (debouncedQuery.trim().length < 3) {
      setSuggestions([])
      return
    }
    let active = true
    getServices()
      .products.suggestDuplicates(brand, model)
      .then((res) => active && setSuggestions(res.map((r) => r.product)))
      .catch(() => active && setSuggestions([]))
    return () => {
      active = false
    }
  }, [debouncedQuery, brand, model])

  const clearFeedback = () => {
    if (error) setError(null)
    if (isDuplicate) setIsDuplicate(false)
    if (showDuplicates) setShowDuplicates(false)
  }

  const submit = async () => {
    setError(null)
    setIsDuplicate(false)
    setBusy(true)
    try {
      const p = await getServices().products.addProduct(
        { brand, model, categoryId, imageUrl: imageUrl.trim() || undefined },
        user!,
      )
      showToast('Продуктът е изпратен за одобрение', 'schedule')
      navigate(`/products/${p.id}`)
    } catch (e) {
      console.error('[product:add] failed', e)
      const code = (e as { code?: string } | null)?.code
      if (code === 'duplicate') {
        const existing = matchedProduct(e)
        setError(
          e instanceof Error && e.message
            ? e.message
            : 'Този продукт вече съществува в каталога.',
        )
        setIsDuplicate(true)
        setShowDuplicates(true)

        // Show the matched product immediately, then enrich with the ranked list
        // (covers inputs that differ a lot from the stored title).
        const known = existing ? [existing] : []
        if (known.length) setSuggestions(known)
        try {
          const list = await getServices().products.suggestDuplicates(brand, model)
          const merged = [...known, ...list.map((r) => r.product)]
          const unique = merged.filter((p, i, arr) => arr.findIndex((x) => x.id === p.id) === i)
          if (unique.length) setSuggestions(unique)
        } catch {
          // keep whatever we already have
        }
      } else {
        setError(describeSubmitError(e))
      }
    } finally {
      setBusy(false)
    }
  }

  const visibleSuggestions = suggestions.slice(0, showDuplicates ? 5 : 3)

  return (
    <div className="form-card" style={{ maxWidth: 520 }}>
      {error && (
        <div style={{ marginBottom: 16 }}>
          <Alert kind={isDuplicate ? 'warning' : 'error'}>
            <b>{isDuplicate ? 'Такъв продукт вече съществува' : 'Неуспешно изпращане'}</b>
            {error}
          </Alert>
        </div>
      )}

      {visibleSuggestions.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <Alert kind="info">
            <b>{showDuplicates ? 'Отвори съществуващия продукт' : 'Възможни съвпадения'}</b>
            {showDuplicates
              ? 'Продуктът вече е в каталога — отвори го, за да прочетеш ревютата или да добавиш своето мнение.'
              : 'Провери дали продуктът вече съществува, преди да добавиш нов.'}
          </Alert>
          <div className="stack" style={{ marginTop: 10 }}>
            {visibleSuggestions.map((s) => (
              <button
                key={s.id}
                className="btn btn-ghost"
                style={{ justifyContent: 'flex-start' }}
                onClick={() => navigate(`/products/${s.id}`)}
              >
                <Msr icon="open_in_new" size="sm" />
                <span style={{ flex: 1, textAlign: 'left' }}>
                  {s.brand} {s.model}
                </span>
                {s.reviewsCount > 0 && (
                  <span className="muted" style={{ fontSize: 12, fontWeight: 500 }}>
                    {reviewCountLabel(s.reviewsCount)}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="field">
        <label>Марка</label>
        <div className="field-input-wrap">
          <Msr icon="sell" size="sm" />
          <input
            type="text"
            value={brand}
            onChange={(e) => {
              setBrand(e.target.value)
              clearFeedback()
            }}
            placeholder="напр. Chicco"
          />
        </div>
      </div>
      <div className="field">
        <label>Модел</label>
        <input
          type="text"
          value={model}
          onChange={(e) => {
            setModel(e.target.value)
            clearFeedback()
          }}
          placeholder="напр. Best Friend Comfort"
        />
      </div>
      <div className="field">
        <label>Тип продукт</label>
        <select
          value={categoryId}
          onChange={(e) => {
            setCategoryId(e.target.value)
            clearFeedback()
          }}
        >
          <option value="">Избери категория...</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Снимка (линк, по избор)</label>
        <input
          type="url"
          value={imageUrl}
          onChange={(e) => {
            setImageUrl(e.target.value)
            clearFeedback()
          }}
          placeholder="https://..."
        />
      </div>
      <p className="field-hint">
        <Msr icon="info" size="sm" />
        Продуктът ще бъде видим в каталога след одобрение от модератор.
      </p>
      <button
        className="btn btn-secondary btn-block"
        style={{ justifyContent: 'center' }}
        onClick={submit}
        disabled={busy || brand.trim().length < 2 || model.trim().length < 2 || !categoryId}
      >
        {busy ? <span className="spinner" /> : <Msr icon="send" size="sm" />}
        Изпрати за одобрение
      </button>
    </div>
  )
}
