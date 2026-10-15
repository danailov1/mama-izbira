import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getServices } from '@/infra/di'
import { useAuth } from '@/presentation/auth/AuthContext'
import { isModerator } from '@/core/usecases/auth-service'
import { Msr } from '@/presentation/components/ui/Msr'
import { EmptyState } from '@/presentation/components/ui/EmptyState'
import { ProductsTab } from './ProductsTab'
import { ReportsTab } from './ReportsTab'
import { CategoriesTab } from './CategoriesTab'

type Tab = 'products' | 'reports' | 'categories'

export function AdminPage() {
  const { user } = useAuth()
  const [tab, setTab] = useState<Tab>('products')
  const [pendingCount, setPendingCount] = useState(0)
  const [reportsCount, setReportsCount] = useState(0)

  useEffect(() => {
    const { products, moderation } = getServices()
    const unsubProducts = products.subscribePending((list) => setPendingCount(list.length))
    const unsubReports = moderation.subscribeReports((list) =>
      setReportsCount(list.filter((r) => r.status === 'new').length),
    )
    return () => {
      unsubProducts()
      unsubReports()
    }
  }, [])

  if (!isModerator(user)) {
    return (
      <div className="page">
        <EmptyState
          icon="shield"
          title="Нямаш достъп"
          text="Само модератори и админи могат да управляват платформата."
          action={
            <Link to="/" className="btn btn-primary">
              <Msr icon="arrow_back" size="sm" />
              Към началото
            </Link>
          }
        />
      </div>
    )
  }

  return (
    <div className="page">
      <span className="eyebrow">
        <Msr icon="verified" size="sm" />
        Модерация
      </span>
      <h1 className="page-title">Админ панел</h1>
      <p className="page-sub">Одобрявай продукти, обработвай доклади и управлявай категориите.</p>

      <div className="tabs" style={{ margin: '20px 0 24px' }}>
        <button className={`tab ${tab === 'products' ? 'active' : ''}`} onClick={() => setTab('products')}>
          Продукти{pendingCount > 0 ? ` (${pendingCount})` : ''}
        </button>
        <button className={`tab ${tab === 'reports' ? 'active' : ''}`} onClick={() => setTab('reports')}>
          Доклади{reportsCount > 0 ? ` (${reportsCount})` : ''}
        </button>
        <button className={`tab ${tab === 'categories' ? 'active' : ''}`} onClick={() => setTab('categories')}>
          Категории
        </button>
      </div>

      {tab === 'products' && <ProductsTab />}
      {tab === 'reports' && <ReportsTab />}
      {tab === 'categories' && <CategoriesTab />}
    </div>
  )
}
