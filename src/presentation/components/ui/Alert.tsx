import { Msr } from './Msr'

export function Alert({
  kind,
  title,
  style,
  children,
}: {
  kind: 'success' | 'warning' | 'error' | 'info'
  title?: string
  style?: React.CSSProperties
  children?: React.ReactNode
}) {
  const icons = {
    success: 'check_circle',
    warning: 'schedule',
    error: 'error',
    info: 'info',
  }
  return (
    <div className={`alert alert-${kind}`} style={style}>
      <Msr icon={icons[kind]} />
      <div>
        {title && <b>{title}</b>}
        {children}
      </div>
    </div>
  )
}
