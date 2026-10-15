import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '@/presentation/auth/AuthContext'
import { Msr } from '../ui/Msr'

export function BottomNav() {
  const { user } = useAuth()
  const navigate = useNavigate()
  return (
    <div className="bottom-nav">
      <NavLink to="/" end>
        <Msr icon="home" fill />
        Начало
      </NavLink>
      <NavLink to="/catalog">
        <Msr icon="category" />
        Категории
      </NavLink>
      <button className="fab" aria-label="Добави продукт" onClick={() => navigate('/products/new')}>
        <Msr icon="add" />
      </button>
      <NavLink to={user ? '/profile' : '/auth'}>
        <Msr icon="favorite_border" />
        Профил
      </NavLink>
      <NavLink to="/catalog">
        <Msr icon="person" />
        Аз
      </NavLink>
    </div>
  )
}
