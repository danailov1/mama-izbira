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

export function ProductForm({ categories }: { categories: Category[] }) {
  const { user } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()

  const [brand, setBrand] = useState('')
  const [model, setModel] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
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

  const submit = async () => {
    setError(null)
    setBusy(true)
    try {
      const p = await getServices().products.addProduct(
        { brand, model, categoryId, imageUrl: imageUrl.trim() || undefined },
        user!,
      )
      showToast('Продуктът е изпратен за одобрение', 'schedule')
      navigate(`/products/${p.id}`)
    } catch (e) {
      if (e instanceof DomainError && e.code === 'duplicate') {
        setError(e.message)
        setShowDuplicates(true)
      } else {
        setError(e instanceof DomainError ? e.message : 'Нещо се обърка — опитай отново.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="form-card" style={{ maxWidth: 520 }}>
      {error && (
        <div style={{ marginBottom: 16 }}>
          <Alert kind="error">
            <b>Неуспешно изпращане</b>
            {error}
          </Alert>
        </div>
      )}

      {showDuplicates && suggestions.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <Alert kind="info">
            <b>Възможни дубликати</b>
            Провери дали продуктът вече съществува, преди да добавиш нов.
          </Alert>
          <div className="stack" style={{ marginTop: 10 }}>
            {suggestions.slice(0, 3).map((s) => (
              <button
                key={s.id}
                className="btn btn-ghost"
                style={{ justifyContent: 'flex-start' }}
                onClick={() => navigate(`/products/${s.id}`)}
              >
                <Msr icon="link" size="sm" />
                {s.brand} {s.model}
              </button>
            ))}
          </div>
        </div>
      )}

      {suggestions.length > 0 && !showDuplicates && (
        <div style={{ marginBottom: 16 }}>
          <Alert kind="info">
            <b>Съвет</b>
            Провери дали продуктът вече съществува, преди да добавиш нов.
          </Alert>
          <div className="stack" style={{ marginTop: 10 }}>
            {suggestions.slice(0, 3).map((s) => (
              <button
                key={s.id}
                className="btn btn-ghost"
                style={{ justifyContent: 'flex-start' }}
                onClick={() => navigate(`/products/${s.id}`)}
              >
                <Msr icon="link" size="sm" />
                {s.brand} {s.model}
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
            onChange={(e) => setBrand(e.target.value)}
            placeholder="напр. Chicco"
          />
        </div>
      </div>
      <div className="field">
        <label>Модел</label>
        <input
          type="text"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="напр. Best Friend Comfort"
        />
      </div>
      <div className="field">
        <label>Тип продукт</label>
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
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
          onChange={(e) => setImageUrl(e.target.value)}
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
