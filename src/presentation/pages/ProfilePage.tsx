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
import { ProductBadge } from '@/presentation/components/ui/Badge'
import { ProductThumb } from '@/presentation/components/product/ProductThumb'
import { ReviewCard } from '@/presentation/components/review/ReviewCard'
import { isModerator } from '@/core/usecases/auth-service'
import { usePageTitle } from '@/presentation/lib/usePageTitle'
import './ProfilePage.css'

export function ProfilePage() {
  const { user, session, loading, logout, resendVerification } = useAuth()
  usePageTitle('Профил')
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
      <div className="page profile-page">
        <div className="skeleton profile-skeleton__title" />
      </div>
    )
  }

  if (!session) {
    return (
      <div className="page profile-page">
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
    <div className="page profile-page">
      <header className="profile-identity">
        <div className="nav-avatar profile-identity__avatar">{initials(displayName)}</div>
        <div className="profile-identity__body">
          <h1 className="page-title profile-identity__name">{displayName}</h1>
          <p className="muted profile-identity__email">{user?.email}</p>
          <div className="row profile-identity__meta">
            {mod && (
              <span className="badge badge-approved">
                <Msr icon="shield" size="sm" />
                {roleLabel(user!.role)}
              </span>
            )}
            {!user && <span className="badge badge-pending">Профилът се създава…</span>}
            <button className="btn btn-ghost btn-sm profile-identity__logout" onClick={() => logout()}>
              <Msr icon="logout" size="sm" />
              Изход
            </button>
          </div>
        </div>
      </header>

      {!session.emailVerified && (
        <Alert kind="warning" title="Потвърди имейла си">
          <p className="profile-verify__text">
            Изпратихме линк за потвърждение на {session.email ?? 'имейла ти'}. Ако не го намираш, провери и папка
            „Спам“.
          </p>
          <button className="btn btn-secondary btn-sm" onClick={() => resendVerification()}>
            <Msr icon="forward_to_inbox" size="sm" />
            Изпрати отново
          </button>
        </Alert>
      )}

      <div className="stats-strip profile-stats">
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

      <section className="profile-section">
        <h2 className="eyebrow profile-section__title">
          <Msr icon="rate_review" size="sm" />
          Моите ревюта
        </h2>
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
          <div className="profile-review-list">
            {activeReviews.map((r) => (
              <div key={r.productId} className="profile-review-item">
                <Link className="profile-review-item__product" to={`/products/${r.productId}?edit=my`}>
                  {productTitles[r.productId] ?? 'Продукт…'}
                </Link>
                <ReviewCard review={r} myReview authorName={displayName} />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="profile-section">
        <h2 className="eyebrow profile-section__title">
          <Msr icon="inventory_2" size="sm" />
          Моите добавени продукти
        </h2>
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
          <div className="grid-cards profile-products">
            {myProducts.map((p) => {
              const category = categories.find((c) => c.id === p.categoryId)
              return (
                <div key={p.id} className="product-card profile-product-card">
                  <div className="product-top">
                    <ProductThumb
                      imageUrl={p.imageUrl}
                      alt={`${p.brand} ${p.model}`}
                      name={`${p.brand} ${p.model}`}
                      categoryIcon={category?.icon}
                      categoryName={category?.name}
                      variant="compact"
                    />
                    <ProductBadge status={p.status} />
                  </div>
                  <div className="profile-product-card__meta">
                    <span className="product-cat">
                      <Msr icon="category" />
                      {category?.name ?? 'Категория'}
                    </span>
                    <h3 className="product-name">
                      <Link className="profile-product-card__link" to={`/products/${p.id}`}>
                        {p.brand} {p.model}
                      </Link>
                    </h3>
                  </div>
                  {p.status === 'rejected' && p.rejectionReason && (
                    <p className="muted profile-product-card__reason">Причина: {p.rejectionReason}</p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
