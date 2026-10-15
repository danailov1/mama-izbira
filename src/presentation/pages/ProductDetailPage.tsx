import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import type { Category } from '@/core/domain/entities/category'
import type { Product } from '@/core/domain/entities/product'
import type { Review } from '@/core/domain/entities/review'
import type { AppUser } from '@/core/domain/entities/user'
import { getServices } from '@/infra/di'
import { useAuth } from '@/presentation/auth/AuthContext'
import { timeAgo } from '@/presentation/lib/format'
import { Msr } from '@/presentation/components/ui/Msr'
import { Stars } from '@/presentation/components/ui/Stars'
import { ProductBadge } from '@/presentation/components/ui/Badge'
import { Alert } from '@/presentation/components/ui/Alert'
import { EmptyState } from '@/presentation/components/ui/EmptyState'
import { ReviewCard } from '@/presentation/components/review/ReviewCard'
import { ReviewForm } from '@/presentation/components/review/ReviewForm'
import { isModerator } from '@/core/usecases/auth-service'

const authorCache = new Map<string, string>()

export function ProductDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { user, session } = useAuth()

  const [product, setProduct] = useState<Product | null>(null)
  const [category, setCategory] = useState<Category | null>(null)
  const [reviews, setReviews] = useState<Review[]>([])
  const [myReview, setMyReview] = useState<Review | null>(null)
  const [authors, setAuthors] = useState<Record<string, string>>({})
  const [creator, setCreator] = useState<AppUser | null>(null)
  const [notFound, setNotFound] = useState(false)

  const editing = searchParams.get('edit') === 'my'

  useEffect(() => {
    if (!id) return
    let active = true
    const { catalog } = getServices()

    catalog.getProduct(id).then((p) => {
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
    return () => {
      active = false
    }
  }, [id])

  useEffect(() => {
    if (!id) return
    const { catalog } = getServices()
    const unsub = catalog.subscribeProduct(id, (p) => {
      if (p) setProduct(p)
      else setNotFound(true)
    })
    return unsub
  }, [id])

  useEffect(() => {
    if (!id) return
    const unsub = getServices().reviews.subscribeByProduct(id, setReviews)
    return unsub
  }, [id])

  useEffect(() => {
    if (!id || !user) {
      setMyReview(null)
      return
    }
    let active = true
    getServices()
      .reviews.getMyReview(id, user.id)
      .then((r) => active && setMyReview(r))
    return () => {
      active = false
    }
  }, [id, user])

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
      const cached = authorCache.get(r.userId)
      if (cached) map[r.userId] = cached
      else map[r.userId] = 'Родител'
    })
    return map
  }, [reviews, authors])

  if (notFound) {
    return (
      <div className="page">
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
    )
  }

  if (!product) {
    return (
      <div className="page">
        <div className="skeleton" style={{ width: '60%', height: 28, marginBottom: 12 }} />
        <div className="skeleton" style={{ width: '100%', height: 120, borderRadius: 22 }} />
      </div>
    )
  }

  const isOwnProduct = user?.id === product.createdBy

  return (
    <div className="page">
      <div className="breadcrumbs">
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

      <div className="product-hero">
        <div className="product-thumb berry" style={{ width: 72, height: 72 }}>
          <Msr icon={category?.icon ?? 'inventory_2'} size="lg" />
        </div>
        <div className="product-hero-info">
          <span className="product-cat">
            <Msr icon={category?.icon ?? 'category'} />
            {category?.name ?? 'Категория'}
          </span>
          <h1 className="page-title" style={{ marginBottom: 4 }}>
            {product.brand} {product.model}
          </h1>
          <div className="row" style={{ gap: 10 }}>
            <ProductBadge status={product.status} />
            {product.reviewsCount > 0 && (
              <div className="rating-line">
                <Stars rating={product.avgRating} size="sm" />
                <span className="rating-num">{product.avgRating.toFixed(1)}</span>
                <span className="muted" style={{ fontSize: 12 }}>
                  · {product.reviewsCount} ревю{product.reviewsCount === 1 ? '' : 'та'}
                </span>
              </div>
            )}
          </div>
          <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            Добавен от {creator?.displayName ?? 'родител'} · {timeAgo(product.createdAt)}
          </p>
        </div>
      </div>

      {product.status === 'approved' && product.reviewsCount > 0 && (
        <div className="row" style={{ margin: '24px 0' }}>
          <div className="stamp">
            <Msr icon="verified" />
            Одобрено
            <br />
            от мамаИзбира
          </div>
        </div>
      )}

      {product.status === 'pending' && (
        <div style={{ margin: '24px 0' }}>
          <Alert kind="warning">
            <b>Чака преглед</b>
            {isOwnProduct
              ? 'Твоят продукт изчаква одобрение от модератор.'
              : 'Този продукт все още не е одобрен от модератор.'}
          </Alert>
        </div>
      )}

      {product.status === 'rejected' && (
        <div style={{ margin: '24px 0' }}>
          <Alert kind="error">
            <b>Отхвърлен</b>
            {product.rejectionReason || 'Продуктът не премина модерацията.'}
          </Alert>
        </div>
      )}

      {product.status === 'approved' && !session && (
        <Alert kind="info" title="Съвет" style={{ marginBottom: 16 }}>
          Влез в профила си, за да пишеш ревюта и да гласуваш за полезните мнения.
        </Alert>
      )}

      {product.status === 'approved' && session && myReview && (
        <div style={{ margin: '20px 0' }}>
          <Alert kind="success">
            <b>Твоето ревю е публикувано</b>
            Оценката ти е включена в средната стойност на продукта.
          </Alert>
        </div>
      )}

      {product.status === 'approved' && (
        <section style={{ marginTop: 28 }}>
          <span className="eyebrow">
            <Msr icon="rate_review" size="sm" />
            Ревюта · {reviews.length}
          </span>
          <h2 className="section-title">Какво мислят родителите</h2>

          {session && (
            <div style={{ margin: '16px 0 28px' }}>
              {myReview && !editing ? (
                <div className="stack">
                  <ReviewCard review={myReview} myReview authorName={user?.displayName} />
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ alignSelf: 'flex-start' }}
                    onClick={() => navigate(`?edit=my`)}
                  >
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
            <div className="stack">
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
        <section style={{ marginTop: 40 }}>
          <Alert kind="info">
            <b>Модераторски панел</b>
            {product.status === 'pending'
              ? 'Продуктът чака решение — виж опашката за одобрение.'
              : 'Статусът е окончателен. Можеш да промениш статуса от опашката.'}
          </Alert>
        </section>
      )}
    </div>
  )
}
