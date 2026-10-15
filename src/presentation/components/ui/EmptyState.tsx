import { Msr } from './Msr'

export function EmptyState({
  icon,
  title,
  text,
  action,
}: {
  icon: string
  title: string
  text?: string
  action?: React.ReactNode
}) {
  return (
    <div className="empty-state">
      <Msr icon={icon} size="xl" />
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  )
}
