import { Link } from 'react-router-dom'
import { useAuth } from '@/presentation/auth/AuthContext'
import { Msr } from '../ui/Msr'
import { initials } from '@/presentation/lib/format'
import { isModerator } from '@/core/usecases/auth-service'

export function Navbar() {
  const { user } = useAuth()
  return (
    <nav className="nav">
      <Link to="/" className="logo">
        мама<span>Избира</span>
      </Link>
      <div className="nav-links">
        <Link to="/">Начало</Link>
        <Link to="/catalog">Каталог</Link>
        {isModerator(user) && <Link to="/admin">Модерация</Link>}
      </div>
      <div className="nav-actions">
        <Link to="/catalog" className="icon-btn" aria-label="Търсене">
          <Msr icon="search" size="sm" />
        </Link>
        {user ? (
          <Link to="/profile" className="nav-avatar" aria-label="Профил">
            {initials(user.displayName || user.email)}
          </Link>
        ) : (
          <Link to="/auth" className="btn btn-primary btn-sm">
            <Msr icon="login" size="sm" />
            Вход
          </Link>
        )}
      </div>
    </nav>
  )
}
