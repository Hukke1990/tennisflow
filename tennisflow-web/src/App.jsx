import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Outlet,
} from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import AuthLayout from './layouts/AuthLayout';
import LandingPage from './pages/LandingPage';
import ClubEntryPage from './pages/ClubEntryPage';
import DashboardPage from './pages/DashboardPage';
import TorneosPage from './pages/TorneosPage';
import LoginPage from './pages/LoginPage';
import RegistroPage from './pages/RegistroPage';
import PerfilPage from './pages/PerfilPage';
import AdminPage from './pages/AdminPage';
import RankingsPage from './pages/RankingsPage';
import BracketPage from './pages/BracketPage';
import ClubNotFoundPage from './pages/ClubNotFoundPage';
import SuperAdminPage from './pages/SuperAdminPage';
import MisClubesPage from './pages/MisClubesPage';
import SuscripcionExitoPage from './pages/SuscripcionExitoPage';
import ActivarClubPage from './pages/ActivarClubPage';
import ProtectedRoute from './components/ProtectedRoute';
import SuperAdminRoute from './components/SuperAdminRoute';
import ClubMemberGuard from './components/ClubMemberGuard';
import ClubActiveGuard from './components/ClubActiveGuard';
import { ClubProvider } from './context/ClubContext';
import './index.css';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route
          path="/super-admin"
          element={(
            <SuperAdminRoute>
              <SuperAdminPage />
            </SuperAdminRoute>
          )}
        />
        <Route path="/club-no-encontrado" element={<ClubNotFoundPage />} />
        <Route path="/suscripcion/exito" element={<SuscripcionExitoPage />} />
        <Route path="/activar/:clubId" element={<ActivarClubPage />} />

        {/*
         * ── RUTA SUPER ADMIN MASTER ─────────────────────────────────────────
         * /admin-master/:clubSlug → entra al panel admin de cualquier club
         * sin pasar por ClubActiveGuard (ignora is_active).
         * Solo accesible para super_admin.
         */}
        <Route
          path="/admin-master/:clubSlug"
          element={(
            <SuperAdminRoute>
              <ClubProvider>
                <ProtectedRoute allowRoles={['super_admin']}>
                  <MainLayout>
                    <AdminPage />
                  </MainLayout>
                </ProtectedRoute>
              </ClubProvider>
            </SuperAdminRoute>
          )}
        />

        <Route path="/:clubSlug" element={<ClubProvider><ClubActiveGuard><Outlet /></ClubActiveGuard></ClubProvider>}>
          {/* Index: muestra login o redirige a inicio segun autenticacion */}
          <Route index element={<ClubEntryPage />} />

          {/* Rutas de autenticacion */}
          <Route element={<AuthLayout />}>
            <Route path="login" element={<LoginPage />} />
            <Route path="registro" element={<RegistroPage />} />
          </Route>

          {/* Selector de club — accesible para usuarios autenticados; fuera del guard */}
          <Route path="mis-clubes" element={<MisClubesPage />} />

          {/* Rutas principales con Navbar */}
          <Route element={<ClubMemberGuard><MainLayout /></ClubMemberGuard>}>
            <Route path="inicio" element={<DashboardPage />} />
            <Route path="torneos" element={<TorneosPage />} />
            <Route path="rankings" element={<RankingsPage />} />
            <Route path="perfil" element={<PerfilPage />} />
            <Route
              path="admin"
              element={(
                <ProtectedRoute allowRoles={['admin', 'super_admin']}>
                  <AdminPage />
                </ProtectedRoute>
              )}
            />
            <Route path="bracket/:torneoId" element={<BracketPage />} />
          </Route>

          {/* Redirigir rutas desconocidas dentro de un club al inicio */}
          <Route path="*" element={<Navigate to="inicio" replace />} />
        </Route>

        {/* Redirigir cualquier ruta desconocida al landing */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;