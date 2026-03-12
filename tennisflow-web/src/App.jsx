import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Outlet,
} from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import AuthLayout from './layouts/AuthLayout';
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
import ProtectedRoute from './components/ProtectedRoute';
import SuperAdminRoute from './components/SuperAdminRoute';
import {
  ClubProvider,
  DEFAULT_CLUB_SLUG,
  buildClubPath,
} from './context/ClubContext';
import './index.css';

function App() {
  const demoHomePath = buildClubPath(DEFAULT_CLUB_SLUG, '/inicio');

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to={demoHomePath} replace />} />
        <Route
          path="/super-admin"
          element={(
            <SuperAdminRoute>
              <SuperAdminPage />
            </SuperAdminRoute>
          )}
        />
        <Route path="/club-no-encontrado" element={<ClubNotFoundPage />} />

        <Route path="/:clubSlug" element={<ClubProvider><Outlet /></ClubProvider>}>
          {/* Rutas de autenticacion */}
          <Route element={<AuthLayout />}>
            <Route path="login" element={<LoginPage />} />
            <Route path="registro" element={<RegistroPage />} />
          </Route>

          {/* Rutas principales con Navbar */}
          <Route element={<MainLayout />}>
            <Route index element={<Navigate to="inicio" replace />} />
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

          {/* Redirigir rutas desconocidas dentro de un club al inicio del club */}
          <Route path="*" element={<Navigate to="inicio" replace />} />
        </Route>

        {/* Redirigir cualquier ruta desconocida al club demo */}
        <Route path="*" element={<Navigate to={demoHomePath} replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
