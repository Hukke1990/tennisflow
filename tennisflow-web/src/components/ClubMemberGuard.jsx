import { useEffect } from 'react';
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
    if (rol === 'super_admin' || !perfil.club_id || String(perfil.club_id) === String(clubId)) {
      verdict = 'allow';
    } else {
      verdict = 'deny';
    }
  }

  // Efecto de lado — solo actúa cuando hay mismatch confirmado (cambio manual de URL)
  useEffect(() => {
    if (verdict !== 'deny') return;
    // IMPORTANTE: esperar a que signOut complete ANTES de recargar la página.
    // Sin el await, la sesión sigue activa en el recargo y se repite el bucle.
    supabase.auth.signOut().then(() => {
      window.location.replace(`/${clubSlug}/login?error=unauthorized`);
    });
  }, [verdict, clubSlug]);

  if (verdict === 'loading' || verdict === 'deny') return <Spinner />;

  return children;
}
