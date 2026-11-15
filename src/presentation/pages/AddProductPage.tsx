import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Category } from '@/core/domain/entities/category'
import { getServices } from '@/infra/di'
import { useAuth } from '@/presentation/auth/AuthContext'
import { Msr } from '@/presentation/components/ui/Msr'
import { ProductForm } from '@/presentation/components/product/ProductForm'
import { Alert } from '@/presentation/components/ui/Alert'
import { usePageTitle } from '@/presentation/lib/usePageTitle'
import './AddProductPage.css'

export function AddProductPage() {
  const { user, loading } = useAuth()
  usePageTitle('Добави продукт')
  const [categories, setCategories] = useState<Category[]>([])

  useEffect(() => {
    const unsub = getServices().catalog.subscribeCategories(setCategories)
    return unsub
  }, [])

  if (loading) {
    return (
      <div className="page add-product-page">
        <div className="add-product-loading">
          <div className="skeleton add-product-skeleton" />
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="page add-product-page">
        <div className="add-product-guard">
          <Alert kind="info">
            <b>Изисква се профил</b>
            Влез или се регистрирай, за да добавяш продукти в каталога.
          </Alert>
          <div className="row add-product-guard-actions">
            <Link to="/auth" className="btn btn-primary">
              <Msr icon="login" size="sm" />
              Вход / Регистрация
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page add-product-page">
      <div className="breadcrumbs">
        <Link to="/">Начало</Link>
        <Msr icon="chevron_right" />
        <Link to="/catalog">Каталог</Link>
        <Msr icon="chevron_right" />
        <span className="current">Добави продукт</span>
      </div>
      <header className="add-product-head">
        <span className="eyebrow">
          <Msr icon="add_circle" size="sm" />
          Нова добавка
        </span>
        <h1 className="page-title">Добави продукт</h1>
        <p className="page-sub">
          Първо провери дали продуктът не съществува вече — ние ще ти покажем съвпадения на живо.
        </p>
      </header>
      <div className="add-product-surface">
        <ProductForm categories={categories} />
      </div>
    </div>
  )
}
