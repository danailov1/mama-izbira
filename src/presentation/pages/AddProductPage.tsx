import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Category } from '@/core/domain/entities/category'
import { getServices } from '@/infra/di'
import { useAuth } from '@/presentation/auth/AuthContext'
import { Msr } from '@/presentation/components/ui/Msr'
import { ProductForm } from '@/presentation/components/product/ProductForm'
import { Alert } from '@/presentation/components/ui/Alert'

export function AddProductPage() {
  const { user, loading } = useAuth()
  const [categories, setCategories] = useState<Category[]>([])

  useEffect(() => {
    const unsub = getServices().catalog.subscribeCategories(setCategories)
    return unsub
  }, [])

  if (loading) {
    return (
      <div className="page">
        <div className="skeleton" style={{ width: '50%', height: 26 }} />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="page">
        <Alert kind="info">
          <b>Изисква се профил</b>
          Влез или се регистрирай, за да добавяш продукти в каталога.
        </Alert>
        <div className="row" style={{ marginTop: 16 }}>
          <Link to="/auth" className="btn btn-primary">
            <Msr icon="login" size="sm" />
            Вход / Регистрация
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="breadcrumbs">
        <Link to="/">Начало</Link>
        <Msr icon="chevron_right" />
        <Link to="/catalog">Каталог</Link>
        <Msr icon="chevron_right" />
        <span className="current">Добави продукт</span>
      </div>
      <span className="eyebrow">
        <Msr icon="add_circle" size="sm" />
        Нова добавка
      </span>
      <h1 className="page-title">Добави продукт</h1>
      <p className="page-sub">
        Първо провери дали продуктът не съществува вече — ние ще ти покажем съвпадения на живо.
      </p>
      <div style={{ marginTop: 20 }}>
        <ProductForm categories={categories} />
      </div>
    </div>
  )
}
