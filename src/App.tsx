import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Layout } from '@/presentation/components/layout/Layout'
import { AuthProvider } from '@/presentation/auth/AuthContext'
import { ToastProvider } from '@/presentation/components/ui/Toast'
import { HomePage } from '@/presentation/pages/HomePage'
import { CatalogPage } from '@/presentation/pages/CatalogPage'
import { ProductDetailPage } from '@/presentation/pages/ProductDetailPage'
import { AddProductPage } from '@/presentation/pages/AddProductPage'
import { AuthPage } from '@/presentation/pages/AuthPage'
import { AdminPage } from '@/presentation/pages/admin/AdminPage'
import { ProfilePage } from '@/presentation/pages/ProfilePage'
import { NotFoundPage } from '@/presentation/pages/NotFoundPage'

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/catalog" element={<CatalogPage />} />
              <Route path="/products/new" element={<AddProductPage />} />
              <Route path="/products/:id" element={<ProductDetailPage />} />
              <Route path="/auth" element={<AuthPage />} />
              <Route path="/admin" element={<AdminPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  )
}
