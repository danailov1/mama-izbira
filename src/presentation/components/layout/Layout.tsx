import { Outlet } from 'react-router-dom'
import { Navbar } from './Navbar'
import { BottomNav } from './BottomNav'

export function Layout() {
  return (
    <>
      <Navbar />
      <main>
        <Outlet />
      </main>
      <footer>мамаИзбира · Ревюта от реални родители · Икони: Material Symbols Rounded</footer>
      <BottomNav />
    </>
  )
}
