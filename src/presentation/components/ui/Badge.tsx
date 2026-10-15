import type { ProductStatus } from '@/core/domain/entities/product'

export function ProductBadge({ status }: { status: ProductStatus }) {
  if (status === 'approved')
    return (
      <span className="badge badge-approved">
        <MsrIcon icon="check_circle" />
        Одобрен
      </span>
    )
  if (status === 'pending')
    return (
      <span className="badge badge-pending">
        <MsrIcon icon="schedule" />
        Чака одобрение
      </span>
    )
  return (
    <span className="badge badge-rejected">
      <MsrIcon icon="cancel" />
      Отхвърлен
    </span>
  )
}

function MsrIcon({ icon }: { icon: string }) {
  return (
    <span className="msr" aria-hidden="true">
      {icon}
    </span>
  )
}
