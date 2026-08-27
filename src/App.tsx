import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { AdminPackPage } from '@/pages/AdminPackPage'
import { AdminPage } from '@/pages/AdminPage'
import { CatalogPage } from '@/pages/CatalogPage'
import { EcosystemPage } from '@/pages/EcosystemPage'
import { FeedbackPage } from '@/pages/FeedbackPage'
import { HomePage } from '@/pages/HomePage'
import { LibraryPage } from '@/pages/LibraryPage'
import { PackPage } from '@/pages/PackPage'

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/catalog" element={<CatalogPage />} />
        <Route path="/packs/:slug" element={<PackPage />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/ecosystem" element={<EcosystemPage />} />
        <Route path="/feedback" element={<FeedbackPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/admin/packs/:slug" element={<AdminPackPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
