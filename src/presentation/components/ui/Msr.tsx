interface MsrProps {
  icon: string
  size?: 'sm' | 'lg' | 'xl' | 'md'
  fill?: boolean
  className?: string
  style?: React.CSSProperties
  onClick?: () => void
}

export function Msr({ icon, size = 'md', fill, className = '', style, onClick }: MsrProps) {
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
    <span className={cls} style={style} onClick={onClick} aria-hidden="true">
      {icon}
    </span>
  )
}
