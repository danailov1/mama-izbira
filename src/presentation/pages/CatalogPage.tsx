import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { Category } from '@/core/domain/entities/category'
import type { Product } from '@/core/domain/entities/product'
import { getServices } from '@/infra/di'
import { useDebounce } from '@/presentation/lib/useDebounce'
import { usePageTitle } from '@/presentation/lib/usePageTitle'
import { Msr } from '@/presentation/components/ui/Msr'
import { Alert } from '@/presentation/components/ui/Alert'
import { ProductCard } from '@/presentation/components/product/ProductCard'
import { EmptyState } from '@/presentation/components/ui/EmptyState'
import { useAuth } from '@/presentation/auth/AuthContext'

type SortKey = 'newest' | 'top' | 'rating'

const PAGE_SIZE = 24

function sortProducts(list: Product[], sort: SortKey): Product[] {
  if (sort === 'rating') {
    return [...list].sort((a, b) => b.avgRating - a.avgRating || b.reviewsCount - a.reviewsCount)
  }
  if (sort === 'top') {
    return [...list].sort((a, b) => b.reviewsCount - a.reviewsCount || b.avgRating - a.avgRating)
  }
  return list
}

export function CatalogPage() {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const categoryParam = searchParams.get('category') ?? ''

  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exhausted, setExhausted] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortKey>('newest')
  const [minRating, setMinRating] = useState(0)

  const debouncedSearch = useDebounce(search)
  usePageTitle('Каталог')

  useEffect(() => {
    const { catalog } = getServices()
    return catalog.subscribeCategories(setCategories)
  }, [])

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    setExhausted(false)
    getServices()
      .catalog.getApproved({
        categoryId: categoryParam || undefined,
        search: debouncedSearch.trim() || undefined,
        sort,
        minRating: minRating || undefined,
        limit: PAGE_SIZE,
      })
      .then((list) => {
        if (!active) return
        setProducts(sortProducts(list, sort))
        setExhausted(list.length === 0)
        setLoading(false)
      })
      .catch((e) => {
        if (!active) return
        setProducts([])
        setError(e instanceof Error ? e.message : 'Продуктите не можаха да се заредят.')
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [categoryParam, debouncedSearch, sort, minRating, reloadToken])

  const loadMore = async () => {
    const last = products[products.length - 1]
    if (!last || loadingMore) return
    setLoadingMore(true)
    try {
      const list = await getServices().catalog.getApproved({
        categoryId: categoryParam || undefined,
        search: debouncedSearch.trim() || undefined,
        sort,
        minRating: minRating || undefined,
        limit: PAGE_SIZE,
        cursorId: last.id,
      })
      if (list.length === 0) {
        setExhausted(true)
      } else {
        setProducts((prev) =>
          sortProducts([...prev, ...list.filter((p) => !prev.some((x) => x.id === p.id))], sort),
        )
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Следващата страница не можа да се зареди.')
    } finally {
      setLoadingMore(false)
    }
  }

  const categoryMap = useMemo(() => {
    const m = new Map<string, Category>()
    categories.forEach((c) => m.set(c.id, c))
    return m
  }, [categories])

  const setCategory = (id: string) => {
    if (id) setSearchParams({ category: id })
    else setSearchParams({})
  }

  const clearFilters = () => {
    setSearch('')
    setMinRating(0)
    setCategory('')
  }

  const hasFilters = !!search || !!categoryParam || minRating > 0

  return (
    <div className="page">
      <span className="eyebrow">
        <Msr icon="category" size="sm" />
        Каталог
      </span>
      <h1 className="page-title">Детски продукти</h1>
      <p className="page-sub">Одобрени продукти с честни ревюта от родители.</p>

      <div className="searchbar" style={{ marginTop: 16 }}>
        <Msr icon="search" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Търси марка или модел..."
        />
        {search && (
          <button
            type="button"
            className="icon-btn"
            style={{ width: 28, height: 28, border: 'none', background: 'none' }}
            aria-label="Изчисти търсенето"
            onClick={() => setSearch('')}
          >
            <Msr icon="close" size="sm" />
          </button>
        )}
      </div>

      <div className="chip-row" style={{ marginTop: 16 }}>
        <button className={`chip ${!categoryParam ? 'active' : ''}`} onClick={() => setCategory('')}>
          <Msr icon="apps" size="sm" />
          Всички
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            className={`chip ${categoryParam === c.id ? 'active' : ''}`}
            onClick={() => setCategory(c.id)}
          >
            <Msr icon={c.icon} size="sm" />
            {c.name}
          </button>
        ))}
      </div>

      <div className="filter-row">
        <div className="tabs">
          <button className={`tab ${sort === 'newest' ? 'active' : ''}`} onClick={() => setSort('newest')}>
            Най-нови
          </button>
          <button className={`tab ${sort === 'top' ? 'active' : ''}`} onClick={() => setSort('top')}>
            Най-коментирани
          </button>
          <button className={`tab ${sort === 'rating' ? 'active' : ''}`} onClick={() => setSort('rating')}>
            Топ оценени
          </button>
        </div>
        {[0, 3, 4].map((r) => (
          <button
            key={r}
            className={`btn btn-ghost btn-sm ${minRating === r ? 'active' : ''}`}
            style={minRating === r ? { borderColor: 'var(--berry)', color: 'var(--berry)' } : undefined}
            onClick={() => setMinRating(r)}
          >
            <Msr icon="star" size="sm" />
            {r === 0 ? 'Всички оценки' : `${r}+ звезди`}
          </button>
        ))}
      </div>

      {error && (
        <div style={{ marginTop: 20 }}>
          <Alert kind="error" title="Грешка при зареждане">
            <p style={{ margin: '4px 0 10px' }}>{error}</p>
            <button className="btn btn-secondary btn-sm" onClick={() => setReloadToken((n) => n + 1)}>
              <Msr icon="refresh" size="sm" />
              Опитай отново
            </button>
          </Alert>
        </div>
      )}

      <div style={{ marginTop: 24 }}>
        {loading ? (
          <div className="grid-cards">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="product-card">
                <div className="skeleton" style={{ width: 52, height: 52, borderRadius: 10 }} />
                <div className="skeleton" style={{ width: '70%', height: 14 }} />
                <div className="skeleton" style={{ width: '40%', height: 12 }} />
                <div className="skeleton" style={{ width: '55%', height: 12 }} />
              </div>
            ))}
          </div>
        ) : !error && products.length === 0 ? (
          <EmptyState
            icon="search_off"
            title={hasFilters ? 'Няма намерени продукти' : 'Каталогът все още е празен'}
            text={
              hasFilters
                ? 'Не открихме продукт по това търсене. Провери правописа или промени филтрите.'
                : 'Бъди първият, който добави продукт в каталога.'
            }
            action={
              !user ? (
                <Link to="/auth" className="btn btn-primary">
                  <Msr icon="login" size="sm" />
                  Влез, за да добавиш продукт
                </Link>
              ) : hasFilters ? (
                <button className="btn btn-ghost" onClick={clearFilters}>
                  <Msr icon="close" size="sm" />
                  Изчисти филтрите
                </button>
              ) : (
                <Link to="/products/new" className="btn btn-primary">
                  <Msr icon="add_circle" size="sm" />
                  Добави продукт
                </Link>
              )
            }
          />
        ) : products.length > 0 ? (
          <>
            <div className="grid-cards">
              {products.map((p) => (
                <ProductCard key={p.id} product={p} category={categoryMap.get(p.categoryId)} />
              ))}
            </div>
            {!exhausted && (
              <div className="center" style={{ marginTop: 24 }}>
                <button className="btn btn-secondary" onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? <span className="spinner" /> : <Msr icon="expand_more" size="sm" />}
                  Зареди още
                </button>
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  )
}
