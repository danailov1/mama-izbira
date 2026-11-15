import { useEffect, useState } from 'react'
import type { Category } from '@/core/domain/entities/category'
import { getServices } from '@/infra/di'
import { useAuth } from '@/presentation/auth/AuthContext'
import { isAdmin } from '@/core/usecases/auth-service'
import { Msr } from '@/presentation/components/ui/Msr'
import { Alert } from '@/presentation/components/ui/Alert'
import { useToast } from '@/presentation/components/ui/Toast'
import './CategoriesTab.css'

const ICON_CHOICES = [
  'stroller',
  'high_chair',
  'directions_car',
  'chair',
  'local_drink',
  'child_care',
  'skillet',
  'toys',
  'baby_changing_station',
  'crib',
  'bedtime',
  'category',
]

export function CategoriesTab() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [categories, setCategories] = useState<Category[]>([])
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('category')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const admin = isAdmin(user)

  useEffect(() => {
    return getServices().moderation.subscribeCategories(setCategories)
  }, [])

  const addCategory = async () => {
    setError(null)
    setBusy(true)
    try {
      await getServices().moderation.addCategory({ name, icon }, user!)
      showToast('Категорията е добавена')
      setName('')
      setIcon('category')
      setShowForm(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Грешка')
    } finally {
      setBusy(false)
    }
  }

  const toggleStatus = async (c: Category) => {
    const next = c.status === 'active' ? 'archived' : 'active'
    try {
      await getServices().moderation.setCategoryStatus(c.id, next, user!)
      showToast(
        next === 'active' ? `Категорията „${c.name}“ е активна` : `Категорията „${c.name}“ е архивирана`,
        next === 'active' ? 'check_circle' : 'archive',
      )
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Грешка', 'error')
    }
  }

  return (
    <div className="stack categories-tab">
      <div className="categories-info">
        <Alert kind="info">
          <b>Категориите са конфигурируеми</b>
          Добавяй нови или архивирай стари — каталогът винаги чете от тази база.
        </Alert>
      </div>

      {admin && (
        <>
          {showForm ? (
            <div className="form-card categories-form-card">
              <h3 className="categories-form-title">Нова категория</h3>
              <div className="field">
                <label>Име</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="напр. Детски легла"
                />
              </div>
              <div className="field">
                <label>Икона</label>
                <div className="chip-row categories-icon-picker">
                  {ICON_CHOICES.map((i) => (
                    <button
                      key={i}
                      type="button"
                      className={`chip ${icon === i ? 'active' : ''}`}
                      onClick={() => setIcon(i)}
                      aria-label={`Икона ${i}`}
                    >
                      <Msr icon={i} size="sm" />
                    </button>
                  ))}
                </div>
              </div>
              {error && (
                <p className="form-error categories-error">
                  <Msr icon="error" size="sm" />
                  {error}
                </p>
              )}
              <div className="row categories-form-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={addCategory}
                  disabled={busy || name.trim().length < 2}
                >
                  {busy ? <span className="spinner" /> : <Msr icon="add" size="sm" />}
                  Добави
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>
                  Отказ
                </button>
              </div>
            </div>
          ) : (
            <div className="categories-form-cta">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowForm(true)}>
                <Msr icon="add_circle" size="sm" />
                Добави категория
              </button>
            </div>
          )}
        </>
      )}

      <div className="categories-table-group">
        <div className="table-wrap">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Категория</th>
                  <th>Slug</th>
                  <th>Ред</th>
                  <th>Статус</th>
                  {admin && <th>Действия</th>}
                </tr>
              </thead>
              <tbody>
                {categories.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <span className="table-product">
                        <div className="table-thumb">
                          <Msr icon={c.icon} />
                        </div>
                        {c.name}
                      </span>
                    </td>
                    <td className="muted">{c.slug}</td>
                    <td>{c.order}</td>
                    <td>
                      <span className={`badge ${c.status === 'active' ? 'badge-approved' : 'badge-rejected'}`}>
                        <Msr icon={c.status === 'active' ? 'check_circle' : 'archive'} size="sm" />
                        {c.status === 'active' ? 'Активна' : 'Архивирана'}
                      </span>
                    </td>
                    {admin && (
                      <td>
                        <button className="btn btn-ghost btn-sm" onClick={() => toggleStatus(c)}>
                          <Msr icon={c.status === 'active' ? 'archive' : 'unarchive'} size="sm" />
                          {c.status === 'active' ? 'Архивирай' : 'Активирай'}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
