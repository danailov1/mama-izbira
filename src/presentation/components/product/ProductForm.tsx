import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Category } from '@/core/domain/entities/category'
import type { Product } from '@/core/domain/entities/product'
import type { DuplicateSuggestion } from '@/core/usecases/product-service'
import { getServices } from '@/infra/di'
import { useAuth } from '@/presentation/auth/AuthContext'
import { DomainError } from '@/core/usecases/auth-service'
import { useDebounce } from '@/presentation/lib/useDebounce'
import { Msr } from '../ui/Msr'
import { useToast } from '../ui/Toast'
import { Alert } from '../ui/Alert'
import './ProductForm.css'

/** A suggestion at or above this score must be confirmed explicitly before submit. */
const LIKELY_DUPLICATE_SCORE = 0.6

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
  const [suggestions, setSuggestions] = useState<DuplicateSuggestion[]>([])
  const [showDuplicates, setShowDuplicates] = useState(false)
  const [overrideDuplicate, setOverrideDuplicate] = useState(false)
  const [hardDuplicate, setHardDuplicate] = useState(false)

  const debouncedQuery = useDebounce(`${brand} ${model}`, 400)

  useEffect(() => {
    if (debouncedQuery.trim().length < 3) {
      setSuggestions([])
      return
    }
    let active = true
    getServices()
      .products.suggestDuplicates(brand, model)
      .then((res) => active && setSuggestions(res))
      .catch(() => active && setSuggestions([]))
    return () => {
      active = false
    }
  }, [debouncedQuery, brand, model])

  const clearFeedback = () => {
    if (error) setError(null)
    if (isDuplicate) setIsDuplicate(false)
    if (showDuplicates) setShowDuplicates(false)
    if (overrideDuplicate) setOverrideDuplicate(false)
    if (hardDuplicate) setHardDuplicate(false)
  }

  const submit = async () => {
    setError(null)
    setIsDuplicate(false)
    if (hardDuplicate) return
    if (
      !overrideDuplicate &&
      suggestions.some((s) => s.score >= LIKELY_DUPLICATE_SCORE)
    ) {
      // A likely duplicate is on screen: never create the product silently.
      setIsDuplicate(true)
      setShowDuplicates(true)
      setError(
        'Изглежда този продукт вече съществува в каталога. Отвори съвпадението или потвърди, че е нов продукт.',
      )
      return
    }
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
        setHardDuplicate(true)

        // Show the matched product immediately, then enrich with the ranked list
        // (covers inputs that differ a lot from the stored title).
        const known = existing ? [{ product: existing, score: 1 }] : []
        if (known.length) setSuggestions(known)
        try {
          const list = await getServices().products.suggestDuplicates(brand, model)
          const merged = [...known, ...list]
          const unique = merged.filter(
            (x, i, arr) => arr.findIndex((y) => y.product.id === x.product.id) === i,
          )
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

  const likelyDuplicates = suggestions.filter((s) => s.score >= LIKELY_DUPLICATE_SCORE)
  const visibleSuggestions = suggestions.slice(0, showDuplicates ? 5 : 3).map((s) => s.product)
  const duplicateBlocked = hardDuplicate || (!overrideDuplicate && likelyDuplicates.length > 0)

  return (
    <div className="form-card product-form">
      {error && (
        <div className="product-form-feedback">
          <Alert kind={isDuplicate ? 'warning' : 'error'}>
            <b>
              {hardDuplicate
                ? 'Такъв продукт вече съществува'
                : isDuplicate
                  ? 'Възможно е продуктът да съществува'
                  : 'Неуспешно изпращане'}
            </b>
            {error}
          </Alert>
        </div>
      )}

      {visibleSuggestions.length > 0 && (
        <div className="product-duplicates">
          <Alert kind="info">
            <b>{showDuplicates ? 'Отвори съществуващия продукт' : 'Възможни съвпадения'}</b>
            {showDuplicates
              ? 'Продуктът вече е в каталога — отвори го, за да прочетеш ревютата или да добавиш своето мнение.'
              : 'Провери дали продуктът вече съществува, преди да добавиш нов.'}
          </Alert>
          <div className="stack product-duplicates-list">
            {visibleSuggestions.map((s) => (
              <button
                key={s.id}
                className="btn btn-ghost product-suggestion"
                onClick={() => navigate(`/products/${s.id}`)}
              >
                <Msr icon="open_in_new" size="sm" />
                <span className="product-suggestion-name">
                  {s.brand} {s.model}
                </span>
                {s.reviewsCount > 0 && (
                  <span className="muted product-suggestion-count">
                    {reviewCountLabel(s.reviewsCount)}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="product-fields">
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
      </div>

      <p className="field-hint product-hint">
        <Msr icon="info" size="sm" />
        Продуктът ще бъде видим в каталога след одобрение от модератор.
      </p>
      {hardDuplicate ? (
        <button
          className="btn btn-secondary btn-block product-submit"
          onClick={() => {
            const first = suggestions[0]?.product
            if (first) navigate(`/products/${first.id}`)
          }}
        >
          <Msr icon="open_in_new" size="sm" />
          Отвори съществуващия продукт
        </button>
      ) : (
        <>
          {!overrideDuplicate && likelyDuplicates.length > 0 && (
            <div className="stack product-duplicate-gate">
              <p className="field-hint">
                <Msr icon="info" size="sm" />
                Намерихме вероятно съвпадение. Ако продуктът е нов, потвърди го, за да продължиш.
              </p>
              <button
                className="btn btn-secondary btn-block"
                onClick={() => {
                  setOverrideDuplicate(true)
                  setError(null)
                  setIsDuplicate(false)
                }}
              >
                <Msr icon="check" size="sm" />
                Това е нов продукт — продължи
              </button>
            </div>
          )}
          <button
            className="btn btn-primary btn-block product-submit"
            onClick={submit}
            disabled={
              busy ||
              duplicateBlocked ||
              brand.trim().length < 2 ||
              model.trim().length < 2 ||
              !categoryId
            }
          >
            {busy ? <span className="spinner" /> : <Msr icon="send" size="sm" />}
            {duplicateBlocked ? 'Провери дубликатите' : 'Изпрати за одобрение'}
          </button>
        </>
      )}
    </div>
  )
}
