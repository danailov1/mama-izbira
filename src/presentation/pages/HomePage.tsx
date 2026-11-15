import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { Category } from '@/core/domain/entities/category'
import type { Product } from '@/core/domain/entities/product'
import { getServices } from '@/infra/di'
import { Msr } from '@/presentation/components/ui/Msr'
import { EmptyState } from '@/presentation/components/ui/EmptyState'
import { ProductCard } from '@/presentation/components/product/ProductCard'
import { plural } from '@/presentation/lib/format'
import { usePageTitle } from '@/presentation/lib/usePageTitle'
import './HomePage.css'

export function HomePage() {
  const navigate = useNavigate()
  const [categories, setCategories] = useState<Category[]>([])
  const [topProducts, setTopProducts] = useState<Product[]>([])
  const [loadingTop, setLoadingTop] = useState(true)
  const [stats, setStats] = useState<{ products: number; reviews: number }>({ products: 0, reviews: 0 })
  usePageTitle()

  useEffect(() => {
    const { catalog } = getServices()
    const unsubCat = catalog.subscribeCategories(setCategories)
    catalog
      .getApproved({ sort: 'rating', limit: 60 })
      .then((list) => setTopProducts(list.slice(0, 6)))
      .catch(() => {})
      .finally(() => setLoadingTop(false))
    catalog
      .getStats()
      .then(setStats)
      .catch(() => {})
    return unsubCat
  }, [])

  return (
    <div className="page home-page">
      <section className="home-page__hero">
        <div className="hero-stars">
          {[1, 2, 3, 4, 5].map((i) => (
            <Msr key={i} icon="star" fill />
          ))}
        </div>
        <p className="hero-quote">„Най-накрая количка, която наистина издържа до детска градина.“</p>
        <p className="hero-byline">
          <b>Ивелина Т.</b> · майка на 2 · Столче за хранене Peg Pérego
        </p>
        <div className="row home-page__hero-actions">
          <button className="btn btn-primary" onClick={() => navigate('/catalog')}>
            <Msr icon="search" size="sm" />
            Разгледай каталога
          </button>
          <button className="btn btn-secondary" onClick={() => navigate('/products/new')}>
            <Msr icon="add_circle" size="sm" />
            Добави продукт
          </button>
        </div>
      </section>

      <section className="home-page__section">
        <span className="eyebrow">
          <Msr icon="category" size="sm" />
          Категории
        </span>
        <div className="chip-row">
          <Link to="/catalog" className="chip">
            <Msr icon="apps" size="sm" />
            Всички
          </Link>
          {categories.map((c) => (
            <Link key={c.id} to={`/catalog?category=${c.id}`} className="chip">
              <Msr icon={c.icon} size="sm" />
              {c.name}
            </Link>
          ))}
        </div>
      </section>

      <section className="home-page__section">
        <span className="eyebrow">
          <Msr icon="verified" size="sm" />
          Одобрено от общността
        </span>
        <h2 className="section-title">Топ оценени сега</h2>
        <p className="section-desc">Продуктите с най-висока средна оценка и най-много ревюта от реални родители.</p>

        {loadingTop ? (
          <div className="grid-cards three">
            {[1, 2, 3].map((i) => (
              <div key={i} className="product-card home-page__skeleton">
                <div className="skeleton home-page__skeleton-thumb" />
                <div className="skeleton home-page__skeleton-line" />
                <div className="skeleton home-page__skeleton-line home-page__skeleton-line--short" />
              </div>
            ))}
          </div>
        ) : topProducts.length === 0 ? (
          <EmptyState
            icon="inventory_2"
            title="Каталогът все още е празен"
            text="Бъди първият, който добави продукт и сподели опита си."
            action={
              <button className="btn btn-secondary" onClick={() => navigate('/products/new')}>
                <Msr icon="add_circle" size="sm" />
                Добави продукт
              </button>
            }
          />
        ) : (
          <div className="grid-cards three">
            {topProducts.map((p) => (
              <ProductCard key={p.id} product={p} category={categories.find((c) => c.id === p.categoryId)} />
            ))}
          </div>
        )}
      </section>

      <section className="home-page__section">
        <div className="stats-strip">
          <div className="stat-card">
            <Msr icon="inventory_2" size="lg" />
            <div className="stat-num">{stats.products.toLocaleString('bg-BG')}</div>
            <div className="stat-label">
              Одобрени {plural(stats.products, 'продукт', 'продукта')}
            </div>
          </div>
          <div className="stat-card">
            <Msr icon="rate_review" size="lg" />
            <div className="stat-num">{stats.reviews.toLocaleString('bg-BG')}</div>
            <div className="stat-label">Ревюта</div>
          </div>
          <div className="stat-card">
            <Msr icon="verified" size="lg" />
            <div className="stat-num">Модерация</div>
            <div className="stat-label">Всеки продукт се преглежда</div>
          </div>
          <div className="stat-card">
            <Msr icon="groups" size="lg" />
            <div className="stat-num">Общност</div>
            <div className="stat-label">Родители като теб</div>
          </div>
        </div>
      </section>

      <section className="home-page__cta">
        <p className="hand-accent home-page__accent">споделено от реални мами</p>
        <button className="btn btn-ghost" onClick={() => navigate('/products/new')}>
          <Msr icon="add_circle" size="sm" />
          Добави продукт в каталога
        </button>
      </section>
    </div>
  )
}
