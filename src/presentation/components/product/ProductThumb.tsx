import { useState } from 'react'
import { Msr } from '../ui/Msr'
import './ProductThumb.css'

export type ProductThumbVariant = 'card' | 'detail' | 'compact'

const PALETTE_COUNT = 6

interface ProductThumbProps {
  imageUrl?: string
  alt: string
  name: string
  categoryIcon?: string
  categoryName?: string
  variant?: ProductThumbVariant
  className?: string
}

/**
 * Stable 32-bit hash of the product name (a base-31 polynomial over UTF-16
 * code units). Deterministic: the same product always gets the same palette,
 * and different names spread across the calm, in-palette materials without any
 * randomness.
 */
function hashName(name: string): number {
  let hash = 0
  for (let i = 0; i < name.length; i += 1) {
    hash = (Math.imul(hash, 31) + name.charCodeAt(i)) >>> 0
  }
  return hash
}

/**
 * The single image surface for a product. Renders the uploaded photo when one
 * exists and falls back to a designed, deterministic placeholder otherwise:
 * a soft layered material made of three design-system tones (chosen by a hash
 * of the product name) with a translucent material chip holding the
 * SF-Symbols-style category glyph.
 *
 * The placeholder is static — no animation by default; press feedback on the
 * surrounding card is already handled by the shared `.product-card` rule.
 */
export function ProductThumb({
  imageUrl,
  alt,
  name,
  categoryIcon,
  categoryName,
  variant = 'card',
  className,
}: ProductThumbProps) {
  // Remember which URL failed instead of a boolean, so navigating to another
  // product recovers the photo automatically when the URL changes.
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const showImage = !!imageUrl && failedUrl !== imageUrl

  const palette = hashName(name) % PALETTE_COUNT
  const classes = [
    'product-thumb',
    `product-thumb--${variant}`,
    showImage ? '' : 'product-thumb--generated',
    showImage ? '' : `product-thumb--p${palette}`,
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={classes}
      role={showImage ? undefined : 'img'}
      aria-label={showImage ? undefined : categoryName ? `Снимка: ${categoryName}` : 'Няма снимка'}
    >
      {showImage ? (
        <img src={imageUrl} alt={alt} loading="lazy" decoding="async" onError={() => setFailedUrl(imageUrl)} />
      ) : (
        <span className="product-thumb__chip" aria-hidden="true">
          <Msr icon={categoryIcon ?? 'category'} size="xl" />
        </span>
      )}
    </div>
  )
}
