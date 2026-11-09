import { Link } from 'react-router-dom'
import { EmptyState } from '@/presentation/components/ui/EmptyState'
import { Msr } from '@/presentation/components/ui/Msr'
import { usePageTitle } from '@/presentation/lib/usePageTitle'

export function NotFoundPage() {
  usePageTitle('Страницата не е намерена')
  return (
    <div className="page">
      <EmptyState
        icon="search_off"
        title="Страницата не е намерена"
        text="Провери адреса или се върни в началото."
        action={
          <Link to="/" className="btn btn-primary">
            <Msr icon="arrow_back" size="sm" />
            Към началото
          </Link>
        }
      />
    </div>
  )
}
