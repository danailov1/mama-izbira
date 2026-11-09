import { Link, Outlet } from 'react-router-dom'
import { Navbar } from './Navbar'
import { BottomNav } from './BottomNav'

export function Layout() {
  return (
    <>
      <Navbar />
      <main>
        <Outlet />
      </main>
      <footer className="site-footer">
        <p className="footer-tagline">мамаИзбира · Ревюта от реални родители</p>
        <nav className="footer-links" aria-label="Полезни връзки">
          <Link to="/catalog">Каталог</Link>
          <Link to="/products/new">Добави продукт</Link>
          <Link to="/auth">Вход</Link>
        </nav>
        <p className="footer-copy">© {new Date().getFullYear()} мамаИзбира</p>
      </footer>
      <BottomNav />
    </>
  )
}
