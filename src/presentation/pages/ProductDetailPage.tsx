import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import type { Category } from '@/core/domain/entities/category'
import type { Product } from '@/core/domain/entities/product'
import type { Review } from '@/core/domain/entities/review'
import type { AppUser } from '@/core/domain/entities/user'
import { getServices } from '@/infra/di'
import { useAuth } from '@/presentation/auth/AuthContext'
import { plural, timeAgo } from '@/presentation/lib/format'
import { usePageTitle } from '@/presentation/lib/usePageTitle'
import { Msr } from '@/presentation/components/ui/Msr'
import { Stars } from '@/presentation/components/ui/Stars'
import { ProductBadge } from '@/presentation/components/ui/Badge'
import { Alert } from '@/presentation/components/ui/Alert'
import { EmptyState } from '@/presentation/components/ui/EmptyState'
import { ReviewCard } from '@/presentation/components/review/ReviewCard'
import { ReviewForm } from '@/presentation/components/review/ReviewForm'
import { ProductThumb } from '@/presentation/components/product/ProductThumb'
import { isModerator } from '@/core/usecases/auth-service'
import './ProductDetailPage.css'

const authorCache = new Map<string, string>()

export function ProductDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { user, session } = useAuth()

  const [product, setProduct] = useState<Product | null>(null)
  const [category, setCategory] = useState<Category | null>(null)
  const [reviews, setReviews] = useState<Review[]>([])
  const [authors, setAuthors] = useState<Record<string, string>>({})
  const [creator, setCreator] = useState<AppUser | null>(null)
  const [notFound, setNotFound] = useState(false)

  const editing = searchParams.get('edit') === 'my'
  const myReview = user ? (reviews.find((r) => r.userId === user.id) ?? null) : null

  usePageTitle(product ? `${product.brand} ${product.model}` : 'Продукт')

  useEffect(() => {
    if (!id) return
    let active = true
    setNotFound(false)
    setProduct(null)
    const { catalog } = getServices()

    catalog
      .getProduct(id)
      .then((p) => {
        if (!active) return
        if (!p) {
          setNotFound(true)
          return
        }
        setProduct(p)
        catalog.getCategoryById(p.categoryId).then((c) => active && setCategory(c))
        if (p.createdBy) {
          getServices()
            .auth.getProfile(p.createdBy)
            .then((u) => active && setCreator(u))
            .catch(() => {})
        }
      })
      .catch(() => active && setNotFound(true))
    return () => {
      active = false
    }
  }, [id])

  useEffect(() => {
    if (!id) return
    const { catalog } = getServices()
    const unsub = catalog.subscribeProduct(id, (p) => {
      if (p) {
        setProduct(p)
        setNotFound(false)
      } else {
        setNotFound(true)
      }
    })
    return unsub
  }, [id])

  useEffect(() => {
    if (!id) return
    const unsub = getServices().reviews.subscribeByProduct(id, setReviews)
    return unsub
  }, [id])

  useEffect(() => {
    const missing = new Set<string>()
    reviews.forEach((r) => {
      if (!authorCache.has(r.userId)) missing.add(r.userId)
    })
    if (missing.size === 0) return
    let active = true
    missing.forEach((uid) => {
      getServices()
        .auth.getProfile(uid)
        .then((u) => {
          const name = u?.displayName || u?.email?.split('@')[0] || 'Родител'
          authorCache.set(uid, name)
          if (active) setAuthors((prev) => ({ ...prev, [uid]: name }))
        })
        .catch(() => {})
    })
    return () => {
      active = false
    }
  }, [reviews])

  const reviewAuthors = useMemo(() => {
    const map: Record<string, string> = {}
    reviews.forEach((r) => {
      map[r.userId] = authors[r.userId] ?? authorCache.get(r.userId) ?? 'Родител'
    })
    return map
  }, [reviews, authors])

  if (notFound) {
    return (
      <div className="page detail-page">
        <div className="detail-notfound-wrap">
          <EmptyState
            icon="inventory_2"
            title="Продуктът не е намерен"
            text="Възможно е да е отхвърлен от модератор или да е изтрит."
            action={
              <button className="btn btn-primary" onClick={() => navigate('/catalog')}>
                <Msr icon="arrow_back" size="sm" />
                Към каталога
              </button>
            }
          />
        </div>
      </div>
    )
  }

  if (!product) {
    return (
      <div className="page detail-page">
        <div className="detail-skeleton">
          <div className="skeleton detail-skeleton-media" />
          <div className="detail-skeleton-body">
            <div className="skeleton detail-skeleton-line detail-skeleton-line-title" />
            <div className="skeleton detail-skeleton-line" />
            <div className="skeleton detail-skeleton-line detail-skeleton-line-short" />
          </div>
        </div>
      </div>
    )
  }

  const isOwnProduct = user?.id === product.createdBy

  return (
    <div className="page detail-page">
      <div className="breadcrumbs detail-breadcrumbs">
        <Link to="/">Начало</Link>
        <Msr icon="chevron_right" />
        <Link to="/catalog">Каталог</Link>
        {category && (
          <>
            <Msr icon="chevron_right" />
            <Link to={`/catalog?category=${category.id}`}>{category.name}</Link>
          </>
        )}
        <Msr icon="chevron_right" />
        <span className="current">
          {product.brand} {product.model}
        </span>
      </div>

      <div className="product-hero detail-hero">
        <div className="detail-hero-media">
          <ProductThumb
            imageUrl={product.imageUrl}
            alt={`${product.brand} ${product.model}`}
            name={`${product.brand} ${product.model}`}
            categoryIcon={category?.icon}
            categoryName={category?.name}
            variant="detail"
          />
        </div>
        <div className="product-hero-info detail-hero-info">
          <span className="product-cat">
            <Msr icon={category?.icon ?? 'category'} />
            {category?.name ?? 'Категория'}
          </span>
          <h1 className="page-title detail-hero-title">
            {product.brand} {product.model}
          </h1>
          <div className="row detail-hero-meta">
            <ProductBadge status={product.status} />
            {product.reviewsCount > 0 && (
              <div className="rating-line detail-hero-rating">
                <Stars rating={product.avgRating} size="sm" />
                <span className="rating-num">{product.avgRating.toFixed(1)}</span>
                <span className="muted detail-hero-rating-count">
                  · {product.reviewsCount} {plural(product.reviewsCount, 'ревю', 'ревюта')}
                </span>
              </div>
            )}
          </div>
          <p className="muted detail-hero-byline">
            Добавен от {creator?.displayName ?? 'родител'} · {timeAgo(product.createdAt)}
          </p>
        </div>
      </div>

      <div className="detail-status-group">
        {product.status === 'approved' && product.reviewsCount > 0 && (
          <div className="detail-status-panel detail-status-approved">
            <div className="stamp">
              <Msr icon="verified" />
              Одобрено
              <br />
              от мамаИзбира
            </div>
          </div>
        )}

        {product.status === 'pending' && (
          <div className="detail-status-panel detail-status-pending">
            <Alert kind="warning">
              <b>Чака преглед</b>
              {isOwnProduct
                ? 'Твоят продукт изчаква одобрение от модератор.'
                : 'Този продукт все още не е одобрен от модератор.'}
            </Alert>
          </div>
        )}

        {product.status === 'rejected' && (
          <div className="detail-status-panel detail-status-rejected">
            <Alert kind="error">
              <b>Отхвърлен</b>
              {product.rejectionReason || 'Продуктът не премина модерацията.'}
            </Alert>
          </div>
        )}

        {product.status === 'approved' && !session && (
          <div className="detail-status-panel detail-status-hint">
            <Alert kind="info" title="Съвет">
              Влез в профила си, за да пишеш ревюта и да гласуваш за полезните мнения.
            </Alert>
          </div>
        )}

        {product.status === 'approved' && session && myReview && (
          <div className="detail-status-panel detail-status-success">
            <Alert kind="success">
              <b>Твоето ревю е публикувано</b>
              Оценката ти е включена в средната стойност на продукта.
            </Alert>
          </div>
        )}
      </div>

      {product.status === 'approved' && (
        <section className="detail-reviews">
          <span className="eyebrow detail-reviews-eyebrow">
            <Msr icon="rate_review" size="sm" />
            Ревюта · {reviews.length}
          </span>
          <h2 className="section-title detail-reviews-title">Какво мислят родителите</h2>

          {session && (
            <div className="detail-review-editor">
              {myReview && !editing ? (
                <div className="stack detail-review-mine">
                  <ReviewCard review={myReview} myReview authorName={user?.displayName} />
                  <button className="btn btn-ghost btn-sm detail-review-edit" onClick={() => navigate(`?edit=my`)}>
                    <Msr icon="edit" size="sm" />
                    Редактирай ревюто
                  </button>
                </div>
              ) : (
                <ReviewForm
                  productId={product.id}
                  existing={myReview}
                  onSaved={() => navigate('.', { replace: true })}
                  onCancel={myReview ? () => navigate('.', { replace: true }) : undefined}
                />
              )}
            </div>
          )}

          {reviews.length === 0 ? (
            <EmptyState
              icon="rate_review"
              title="Все още няма ревюта"
              text={session ? 'Бъди първият, който сподели опита си с този продукт.' : 'Влез, за да бъдеш първият с мнение.'}
            />
          ) : (
            <div className="detail-review-list">
              {reviews
                .filter((r) => !(myReview && r.id === myReview.id))
                .map((r) => (
                  <ReviewCard
                    key={r.id}
                    review={r}
                    authorName={reviewAuthors[r.userId]}
                    myReview={r.userId === user?.id}
                  />
                ))}
            </div>
          )}
        </section>
      )}

      {isModerator(user) && (
        <section className="detail-moderator">
          <Alert kind="info">
            <b>Модераторски панел</b>
            {product.status === 'pending'
              ? 'Продуктът чака решение — виж опашката за одобрение в Админ панел → Продукти.'
              : 'Можеш да промениш статуса от Админ панел → Продукти → „Всички“. Там се показват и вече решените продукти.'}
          </Alert>
        </section>
      )}
    </div>
  )
}
