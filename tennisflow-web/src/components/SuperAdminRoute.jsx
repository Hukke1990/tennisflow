import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { DEFAULT_CLUB_SLUG, buildClubPath } from '../context/ClubContext';

const DEMO_LOGIN_PATH = buildClubPath(DEFAULT_CLUB_SLUG, '/login');
const DEMO_HOME_PATH = buildClubPath(DEFAULT_CLUB_SLUG, '/inicio');

export default function SuperAdminRoute({ children }) {
  const location = useLocation();
  const { user, rolReal, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="w-10 h-10 border-4 border-emerald-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to={DEMO_LOGIN_PATH} replace state={{ from: location }} />;
  }

  if (String(rolReal || '').toLowerCase() !== 'super_admin') {
    return <Navigate to={DEMO_HOME_PATH} replace />;
  }

  return children;
}
