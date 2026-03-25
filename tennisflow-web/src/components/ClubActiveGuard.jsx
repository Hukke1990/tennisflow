import { Navigate } from 'react-router-dom';
import { useClub } from '../context/ClubContext';
import { useAuth } from '../context/AuthContext';

export default function ClubActiveGuard({ children }) {
  const { club } = useClub();
  const { rolReal } = useAuth();

  // Super admin puede entrar a cualquier club sin importar su estado de activación
  const isSuperAdmin = String(rolReal || '').toLowerCase() === 'super_admin';
  if (isSuperAdmin) return children;

  // is_active === false (explícito) → redirigir a la página de pago
  // undefined/null/true → dejar pasar (backward compat mientras club carga)
  if (club && club.is_active === false) {
    return <Navigate to={`/activar/${club.id}`} replace />;
  }

  return children;
}
