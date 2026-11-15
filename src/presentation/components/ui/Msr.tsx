import { iconPaths } from './icon-paths'

interface MsrProps {
  icon: string
  size?: 'sm' | 'lg' | 'xl' | 'md'
  fill?: boolean
  className?: string
  style?: React.CSSProperties
}

/* Neutral glyph for unknown names (Firestore categories can hold anything). */
const FALLBACK_ICON = 'category'

export function Msr({ icon, size = 'md', fill, className = '', style }: MsrProps) {
  const cls = [
    'msr',
    size === 'sm' ? 'sm' : '',
    size === 'lg' ? 'lg' : '',
    size === 'xl' ? 'xl' : '',
    fill ? 'fill' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')
  // Solid variants (e.g. star-filled) are only used when the caller asks for
  // fill; everything else keeps the monoline stroke rendering.
  const solid = fill ? iconPaths[`${icon}-filled`] : undefined
  const markup = solid ?? iconPaths[icon] ?? iconPaths[FALLBACK_ICON]
  return (
    <span className={cls} style={style} aria-hidden="true">
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
        fill={solid ? 'currentColor' : 'none'}
        stroke={solid ? 'none' : 'currentColor'}
        strokeWidth={solid ? undefined : 1.75}
        strokeLinecap={solid ? undefined : 'round'}
        strokeLinejoin={solid ? undefined : 'round'}
        dangerouslySetInnerHTML={{ __html: markup }}
      />
    </span>
  )
}
