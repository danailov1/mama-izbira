import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Category } from '@/core/domain/entities/category'
import type { Product } from '@/core/domain/entities/product'
import { getServices } from '@/infra/di'
import { useAuth } from '@/presentation/auth/AuthContext'
import { Msr } from '@/presentation/components/ui/Msr'
import { EmptyState } from '@/presentation/components/ui/EmptyState'
import { Modal } from '@/presentation/components/ui/Modal'
import { ProductBadge } from '@/presentation/components/ui/Badge'
import { useToast } from '@/presentation/components/ui/Toast'
import { formatDate, initials } from '@/presentation/lib/format'

type Filter = 'pending' | 'all'

export function ProductsTab() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [creators, setCreators] = useState<Record<string, string>>({})
  const [filter, setFilter] = useState<Filter>('pending')
  const [rejecting, setRejecting] = useState<Product | null>(null)
  const [reason, setReason] = useState('')

  useEffect(() => {
    const { products: productService, catalog } = getServices()
    const unsubProducts = productService.subscribeAll(setProducts)
    const unsubCats = catalog.subscribeCategories(setCategories)
    return () => {
      unsubProducts()
      unsubCats()
    }
  }, [])

  const visible = filter === 'pending' ? products.filter((p) => p.status === 'pending') : products

  useEffect(() => {
    const missing = new Set<string>()
    visible.forEach((p) => missing.add(p.createdBy))
    if (missing.size === 0) return
    let active = true
    missing.forEach((uid) => {
      getServices()
        .auth.getProfile(uid)
        .then((u) => {
          const name = u?.displayName || u?.email?.split('@')[0] || 'Родител'
          if (active) setCreators((prev) => ({ ...prev, [uid]: name }))
        })
        .catch(() => {})
    })
    return () => {
      active = false
    }
  }, [visible])

  const approve = async (p: Product) => {
    try {
      await getServices().products.approve(p.id, user!)
      showToast(`${p.brand} ${p.model} е одобрен`)
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Грешка', 'error')
    }
  }

  const confirmReject = async () => {
    if (!rejecting) return
    try {
      await getServices().products.reject(rejecting.id, reason, user!)
      showToast(`${rejecting.brand} ${rejecting.model} е отхвърлен`, 'cancel')
      setRejecting(null)
      setReason('')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Грешка', 'error')
    }
  }

  const filterRow = (
    <div className="filter-row" style={{ marginTop: 0 }}>
      <button
        className={`btn btn-ghost btn-sm ${filter === 'pending' ? 'active' : ''}`}
        style={filter === 'pending' ? { borderColor: 'var(--berry)', color: 'var(--berry)' } : undefined}
        onClick={() => setFilter('pending')}
      >
        <Msr icon="schedule" size="sm" />
        Чакащи
      </button>
      <button
        className={`btn btn-ghost btn-sm ${filter === 'all' ? 'active' : ''}`}
        style={filter === 'all' ? { borderColor: 'var(--berry)', color: 'var(--berry)' } : undefined}
        onClick={() => setFilter('all')}
      >
        <Msr icon="inventory_2" size="sm" />
        Всички
      </button>
    </div>
  )

  return (
    <div className="stack">
      {filterRow}

      {visible.length === 0 ? (
        <EmptyState
          icon="task_alt"
          title={filter === 'pending' ? 'Няма чакащи продукти' : 'Няма продукти'}
          text={
            filter === 'pending'
              ? 'Опашката е празна — всичко е одобрено. Чудесна работа!'
              : 'Все още няма добавени продукти.'
          }
        />
      ) : (
        <div className="table-wrap">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Продукт</th>
                  <th>Категория</th>
                  <th>Статус</th>
                  <th>Добавен от</th>
                  <th>Дата</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link to={`/products/${p.id}`} className="table-product">
                        <div className="table-thumb">
                          <Msr icon={categories.find((c) => c.id === p.categoryId)?.icon ?? 'inventory_2'} />
                        </div>
                        {p.brand} {p.model}
                      </Link>
                    </td>
                    <td>{categories.find((c) => c.id === p.categoryId)?.name ?? 'Категория'}</td>
                    <td>
                      <ProductBadge status={p.status} />
                    </td>
                    <td>
                      <span className="inline">
                        <span className="avatar" style={{ width: 26, height: 26, fontSize: 10 }}>
                          {initials(creators[p.createdBy] ?? 'Р')}
                        </span>
                        {creators[p.createdBy] ?? 'Родител'}
                      </span>
                    </td>
                    <td>{formatDate(p.createdAt)}</td>
                    <td>
                      <div className="row-actions">
                        {p.status !== 'approved' && (
                          <button
                            className="btn btn-icon-only btn-primary"
                            style={{ width: 34, height: 34 }}
                            aria-label={`Одобри ${p.brand} ${p.model}`}
                            onClick={() => approve(p)}
                          >
                            <Msr icon="check" size="sm" />
                          </button>
                        )}
                        {p.status !== 'rejected' && (
                          <button
                            className="btn btn-icon-only btn-danger"
                            style={{ width: 34, height: 34 }}
                            aria-label={`Отхвърли ${p.brand} ${p.model}`}
                            onClick={() => setRejecting(p)}
                          >
                            <Msr icon="close" size="sm" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {rejecting && (
        <Modal title="Отхвърли продукта" onClose={() => setRejecting(null)}>
          <p>
            Защо <b>{rejecting.brand} {rejecting.model}</b> не преминава модерацията?
          </p>
          <div className="field">
            <label>Причина</label>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="напр. дубликат на съществуващ продукт, липсваща информация..."
            />
          </div>
          <div className="row">
            <button className="btn btn-danger" onClick={confirmReject} disabled={reason.trim().length < 3}>
              <Msr icon="cancel" size="sm" />
              Отхвърли
            </button>
            <button className="btn btn-ghost" onClick={() => setRejecting(null)}>
              Отказ
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
