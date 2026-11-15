import type { ProductStatus } from '@/core/domain/entities/product'
import { Msr } from './Msr'

export function ProductBadge({ status }: { status: ProductStatus }) {
  if (status === 'approved')
    return (
      <span className="badge badge-approved">
        <Msr icon="check_circle" />
        Одобрен
      </span>
    )
  if (status === 'pending')
    return (
      <span className="badge badge-pending">
        <Msr icon="schedule" />
        Чака одобрение
      </span>
    )
  return (
    <span className="badge badge-rejected">
      <Msr icon="cancel" />
      Отхвърлен
    </span>
  )
}
