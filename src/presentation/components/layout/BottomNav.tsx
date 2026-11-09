import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '@/presentation/auth/AuthContext'
import { isModerator } from '@/core/usecases/auth-service'
import { Msr } from '../ui/Msr'

export function BottomNav() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const mod = isModerator(user)
  return (
    <div className="bottom-nav">
      <NavLink to="/" end>
        <Msr icon="home" fill />
        Начало
      </NavLink>
      <NavLink to="/catalog">
        <Msr icon="category" />
        Каталог
      </NavLink>
      <button className="fab" aria-label="Добави продукт" onClick={() => navigate('/products/new')}>
        <Msr icon="add" />
      </button>
      {mod && (
        <NavLink to="/admin">
          <Msr icon="shield" />
          Модерация
        </NavLink>
      )}
      <NavLink to={user ? '/profile' : '/auth'}>
        <Msr icon="person" />
        Профил
      </NavLink>
    </div>
  )
}
