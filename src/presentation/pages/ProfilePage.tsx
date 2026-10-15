import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Category } from '@/core/domain/entities/category'
import type { Product } from '@/core/domain/entities/product'
import type { Review } from '@/core/domain/entities/review'
import { getServices } from '@/infra/di'
import { useAuth } from '@/presentation/auth/AuthContext'
import { initials, roleLabel } from '@/presentation/lib/format'
import { Msr } from '@/presentation/components/ui/Msr'
import { Alert } from '@/presentation/components/ui/Alert'
import { EmptyState } from '@/presentation/components/ui/EmptyState'
import { Stars } from '@/presentation/components/ui/Stars'
import { ProductBadge } from '@/presentation/components/ui/Badge'
import { ReviewCard } from '@/presentation/components/review/ReviewCard'
import { isModerator } from '@/core/usecases/auth-service'

export function ProfilePage() {
  const { user, session, loading, logout, resendVerification } = useAuth()
  const [myProducts, setMyProducts] = useState<Product[]>([])
  const [myReviews, setMyReviews] = useState<Review[]>([])
  const [productTitles, setProductTitles] = useState<Record<string, string>>({})
  const [categories, setCategories] = useState<Category[]>([])

  useEffect(() => {
    if (!user) return
    const unsubProducts = getServices().products.subscribeMine(user.id, setMyProducts)
    const unsubReviews = getServices().reviews.subscribeMine(user.id, setMyReviews)
    const unsubCats = getServices().catalog.subscribeCategories(setCategories)
    return () => {
      unsubProducts()
      unsubReviews()
      unsubCats()
    }
  }, [user])

  useEffect(() => {
    const missing = new Set<string>()
    myReviews.forEach((r) => {
      if (!productTitles[r.productId]) missing.add(r.productId)
    })
    if (missing.size === 0) return
    let active = true
    missing.forEach((pid) => {
      getServices()
        .catalog.getProduct(pid)
        .then((p) => active && p && setProductTitles((prev) => ({ ...prev, [pid]: `${p.brand} ${p.model}` })))
        .catch(() => {})
    })
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myReviews])

  if (loading) {
    return (
      <div className="page">
        <div className="skeleton" style={{ width: '40%', height: 26 }} />
      </div>
    )
  }

  if (!session) {
    return (
      <div className="page">
        <EmptyState
          icon="person"
          title="Все още не си влязъл"
          text="Влез в профила си, за да виждаш своите ревюта и добавени продукти."
          action={
            <Link to="/auth" className="btn btn-primary">
              <Msr icon="login" size="sm" />
              Вход / Регистрация
            </Link>
          }
        />
      </div>
    )
  }

  const displayName = user?.displayName || session.displayName || 'Родител'
  const activeReviews = myReviews.filter((r) => r.status === 'visible')
  const mod = isModerator(user)

  return (
    <div className="page">
      <div className="product-hero">
        <div className="nav-avatar" style={{ width: 64, height: 64, fontSize: 20 }}>
          {initials(displayName)}
        </div>
        <div className="product-hero-info">
          <h1 className="page-title" style={{ marginBottom: 2 }}>
            {displayName}
          </h1>
          <p className="muted" style={{ fontSize: 13 }}>
            {user?.email}
          </p>
          <div className="row" style={{ gap: 10, marginTop: 8 }}>
            {mod && (
              <span className="badge badge-approved">
                <Msr icon="shield" size="sm" />
                {roleLabel(user!.role)}
              </span>
            )}
            {!user && <span className="badge badge-pending">Профилът се създава…</span>}
            <button className="btn btn-ghost btn-sm" onClick={() => logout()}>
              <Msr icon="logout" size="sm" />
              Изход
            </button>
          </div>
        </div>
      </div>

      {!session.emailVerified && (
        <Alert kind="warning" style={{ marginTop: 18 }} title="Потвърди имейла си">
          <p style={{ margin: '4px 0 10px' }}>
            Изпратихме линк за потвърждение на {session.email ?? 'имейла ти'}. Ако не го намираш, провери и
            папка „Спам“.
          </p>
          <button className="btn btn-secondary btn-sm" onClick={() => resendVerification()}>
            <Msr icon="forward_to_inbox" size="sm" />
            Изпрати отново
          </button>
        </Alert>
      )}

      <div className="stats-strip" style={{ marginTop: 24 }}>
        <div className="stat-card">
          <Msr icon="rate_review" size="lg" />
          <div className="stat-num">{activeReviews.length}</div>
          <div className="stat-label">Мои ревюта</div>
        </div>
        <div className="stat-card">
          <Msr icon="inventory_2" size="lg" />
          <div className="stat-num">{myProducts.length}</div>
          <div className="stat-label">Добавени продукта</div>
        </div>
      </div>

      <section style={{ marginTop: 32 }}>
        <span className="eyebrow">
          <Msr icon="rate_review" size="sm" />
          Моите ревюта
        </span>
        {activeReviews.length === 0 ? (
          <EmptyState
            icon="edit_note"
            title="Нямаш ревюта още"
            text="Напиши първото си ревю и помогни на други родители."
            action={
              <Link to="/catalog" className="btn btn-primary">
                <Msr icon="search" size="sm" />
                Разгледай каталога
              </Link>
            }
          />
        ) : (
          <div className="stack">
            {activeReviews.map((r) => (
              <div key={r.productId}>
                <div className="inline" style={{ marginBottom: 8 }}>
                  <Link
                    to={`/products/${r.productId}?edit=my`}
                    style={{ fontWeight: 700, fontSize: 14, color: 'var(--berry)' }}
                  >
                    {productTitles[r.productId] ?? 'Продукт…'}
                  </Link>
                  <Stars rating={r.rating} size="sm" />
                </div>
                <ReviewCard review={r} myReview authorName={displayName} />
              </div>
            ))}
          </div>
        )}
      </section>

      <section style={{ marginTop: 40 }}>
        <span className="eyebrow">
          <Msr icon="inventory_2" size="sm" />
          Моите добавени продукти
        </span>
        {myProducts.length === 0 ? (
          <EmptyState
            icon="add_circle"
            title="Не си добавял продукти"
            text="Знаеш за продукт, който липсва? Добави го — след одобрение ще е видим за всички."
            action={
              <Link to="/products/new" className="btn btn-secondary">
                <Msr icon="add_circle" size="sm" />
                Добави продукт
              </Link>
            }
          />
        ) : (
          <div className="grid-cards">
            {myProducts.map((p) => (
              <div key={p.id} className="product-card" style={{ cursor: 'default' }}>
                <div className="product-top">
                  <div className="product-thumb">
                    <Msr icon={categories.find((c) => c.id === p.categoryId)?.icon ?? 'inventory_2'} />
                  </div>
                  <ProductBadge status={p.status} />
                </div>
                <div>
                  <span className="product-cat">
                    <Msr icon="category" />
                    {categories.find((c) => c.id === p.categoryId)?.name ?? 'Категория'}
                  </span>
                  <h3 className="product-name">
                    <Link to={`/products/${p.id}`}>
                      {p.brand} {p.model}
                    </Link>
                  </h3>
                </div>
                {p.status === 'rejected' && p.rejectionReason && (
                  <p className="muted" style={{ fontSize: 12, margin: 0 }}>
                    Причина: {p.rejectionReason}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
