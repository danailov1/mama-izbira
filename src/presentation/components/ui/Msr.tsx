interface MsrProps {
  icon: string
  size?: 'sm' | 'lg' | 'xl' | 'md'
  fill?: boolean
  className?: string
  style?: React.CSSProperties
}

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
  return (
    <span className={cls} style={style} aria-hidden="true">
      {icon}
    </span>
  )
}
