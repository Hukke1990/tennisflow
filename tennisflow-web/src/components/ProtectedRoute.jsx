import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useClubPath } from '../context/ClubContext';

const normalizeRole = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'superadmin') return 'super_admin';
  if (normalized === 'super_admin') return 'super_admin';
  if (normalized === 'admin') return 'admin';
  return 'jugador';
};

export default function ProtectedRoute({ children, allowRoles = [] }) {
  const location = useLocation();
  const toClubPath = useClubPath();
  const { user, rol, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-10 h-10 border-4 border-emerald-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to={toClubPath('/login')} replace state={{ from: location }} />;
  }

  if (allowRoles.length > 0) {
    const allowed = new Set(allowRoles.map((role) => normalizeRole(role)));
    if (!allowed.has(normalizeRole(rol))) {
      return <Navigate to={toClubPath('/inicio')} replace />;
    }
  }

  return children;
}
