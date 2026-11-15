import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getServices } from '@/infra/di'
import { useAuth } from '@/presentation/auth/AuthContext'
import { isModerator } from '@/core/usecases/auth-service'
import { usePageTitle } from '@/presentation/lib/usePageTitle'
import { Msr } from '@/presentation/components/ui/Msr'
import { EmptyState } from '@/presentation/components/ui/EmptyState'
import { ProductsTab } from './ProductsTab'
import { ReportsTab } from './ReportsTab'
import { CategoriesTab } from './CategoriesTab'
import './AdminPage.css'

type Tab = 'products' | 'reports' | 'categories'

export function AdminPage() {
  const { user } = useAuth()
  usePageTitle('Админ панел')

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

  return <AdminDashboard />
}

function AdminDashboard() {
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

  return (
    <div className="page admin-page">
      <header className="admin-header">
        <span className="eyebrow admin-eyebrow">
          <Msr icon="verified" size="sm" />
          Модерация
        </span>
        <h1 className="page-title admin-title">Админ панел</h1>
        <p className="page-sub admin-sub">Одобрявай продукти, обработвай доклади и управлявай категориите.</p>
      </header>

      <div className="tabs admin-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'products'}
          className={`tab admin-tab ${tab === 'products' ? 'active' : ''}`}
          onClick={() => setTab('products')}
        >
          <Msr icon="inventory_2" size="sm" />
          Продукти
          {pendingCount > 0 && <span className="admin-tab-count">{` (${pendingCount})`}</span>}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'reports'}
          className={`tab admin-tab ${tab === 'reports' ? 'active' : ''}`}
          onClick={() => setTab('reports')}
        >
          <Msr icon="flag" size="sm" />
          Доклади
          {reportsCount > 0 && <span className="admin-tab-count">{` (${reportsCount})`}</span>}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'categories'}
          className={`tab admin-tab ${tab === 'categories' ? 'active' : ''}`}
          onClick={() => setTab('categories')}
        >
          <Msr icon="category" size="sm" />
          Категории
        </button>
      </div>

      {tab === 'products' && <ProductsTab />}
      {tab === 'reports' && <ReportsTab />}
      {tab === 'categories' && <CategoriesTab />}
    </div>
  )
}
