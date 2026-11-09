import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Category } from '@/core/domain/entities/category'
import type { Product } from '@/core/domain/entities/product'
import { ProductBadge } from '../ui/Badge'
import { Msr } from '../ui/Msr'
import { Stars } from '../ui/Stars'
import { plural } from '@/presentation/lib/format'

export function ProductCard({ product, category }: { product: Product; category?: Category | null }) {
  const [imageFailed, setImageFailed] = useState(false)
  const showImage = !!product.imageUrl && !imageFailed
  return (
    <Link to={`/products/${product.id}`} className="product-card">
      <div className="product-top">
        <div className="product-thumb">
          {showImage ? (
            <img src={product.imageUrl} alt={`${product.brand} ${product.model}`} onError={() => setImageFailed(true)} />
          ) : (
            <Msr icon={category?.icon ?? 'inventory_2'} />
          )}
        </div>
        <ProductBadge status={product.status} />
      </div>
      <div>
        <span className="product-cat">
          <Msr icon={category?.icon ?? 'category'} />
          {category?.name ?? 'Категория'}
        </span>
        <h3 className="product-name">{product.brand} {product.model}</h3>
        <p className="product-brand">{product.brand}</p>
      </div>
      {product.reviewsCount > 0 ? (
        <div className="rating-line">
          <Stars rating={product.avgRating} size="sm" />
          <span className="rating-num">{product.avgRating.toFixed(1)}</span>
          <span style={{ color: 'var(--grey)', fontSize: 12 }}>
            · {product.reviewsCount} {plural(product.reviewsCount, 'ревю', 'ревюта')}
          </span>
        </div>
      ) : (
        <span style={{ color: 'var(--grey)', fontSize: 13 }}>Все още няма ревюта</span>
      )}
    </Link>
  )
}
