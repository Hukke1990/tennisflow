import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useClub } from '../context/ClubContext';

const Spinner = () => (
  <div className="flex min-h-screen items-center justify-center bg-gray-900">
    <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-400 border-t-transparent" />
  </div>
);

/**
 * Guard de pertenencia al club — segunda línea de defensa.
 *
 * El veredicto se deriva SINCRÓNICAMENTE del estado del contexto, sin
 * consultas adicionales a Supabase. La validación primaria es atómica
 * y ocurre en AuthContext.signIn antes de que el usuario sea redirigido.
 *
 * - 'loading' → auth/club/perfil sincronizando         → Spinner
 * - 'allow'   → usuario verificado y club correcto      → children
 * - 'deny'    → club incorrecto (cambio manual de URL)  → Spinner + signOut + hard redirect
 */
export default function ClubMemberGuard({ children }) {
  const { user, perfil, loading: authLoading } = useAuth();
  const { clubId, clubSlug, loading: clubLoading } = useClub();

  let verdict;
  if (authLoading || clubLoading) {
    verdict = 'loading';
  } else if (!user) {
    verdict = 'allow'; // sin sesión: cada página maneja su propia auth
  } else if (perfil?.id !== user.id) {
    verdict = 'loading'; // perfil=null o stale de usuario anterior → esperar sync
  } else if (!clubId) {
    verdict = 'allow';
  } else {
    const rol = String(perfil.rol || '').toLowerCase();
    const clubIds = perfil.clubIds || [];
    // Multi-tenancy: verificar club primario Y tabla de membresías
    const esDelClub = (
      rol === 'super_admin' ||
      !perfil.club_id ||          // legacy: sin club asignado
      String(perfil.club_id) === String(clubId) ||
      clubIds.includes(String(clubId))
    );
    verdict = esDelClub ? 'allow' : 'deny';
  }

  // Efecto de lado — solo actúa cuando hay mismatch confirmado (cambio manual de URL)
  // o cuando un usuario de otro club logró pasar el login (race condition).
  // No necesitamos redirect aquí: <Navigate> ya lo maneja de forma inmediata.
  useEffect(() => {
    if (verdict !== 'deny') return;
    supabase.auth.signOut(); // signOut en background; la navegación ya ocurrió vía <Navigate>
  }, [verdict]);

  if (verdict === 'loading') return <Spinner />;

  // Redirigir sin mostrar spinner ni recargar la página, pasando el error por state
  if (verdict === 'deny') {
    return <Navigate to={`/${clubSlug}/login`} replace state={{ error: 'No tenés permiso para acceder a este club. Contactá al administrador.' }} />;
  }

  return children;
}
