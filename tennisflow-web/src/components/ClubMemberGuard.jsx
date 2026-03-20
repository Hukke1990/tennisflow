import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useClub, buildClubPath } from '../context/ClubContext';

/**
 * Verifica que el usuario autenticado pertenezca al club del slug actual.
 * - super_admin: puede acceder a cualquier club (sin restricción).
 * - admin / jugador: si su perfil.club_id no coincide con el clubId del contexto,
 *   son redirigidos al inicio de su propio club.
 */
export default function ClubMemberGuard({ children }) {
  const { user, perfil, rolReal, loading: authLoading } = useAuth();
  const { clubId, loading: clubLoading } = useClub();
  const [redirectTo, setRedirectTo] = useState(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    // Esperar a que ambos contextos terminen de cargar.
    if (authLoading || clubLoading) return;

    // Sin sesión o sin club en la URL → dejar pasar (otros guards manejan esto).
    if (!user || !clubId) {
      setChecked(true);
      return;
    }

    // super_admin tiene acceso a todos los clubes.
    if (rolReal === 'super_admin') {
      setChecked(true);
      return;
    }

    const profileClubId = perfil?.club_id;

    // Perfil aún no cargado o sin club asignado → permitir paso.
    if (!profileClubId) {
      setChecked(true);
      return;
    }

    // El usuario pertenece a este club → permitir paso.
    if (String(profileClubId) === String(clubId)) {
      setChecked(true);
      return;
    }

    // El usuario pertenece a OTRO club → buscar su slug y redirigir.
    supabase
      .from('clubes')
      .select('slug')
      .eq('id', profileClubId)
      .maybeSingle()
      .then(({ data }) => {
        setRedirectTo(data?.slug ? buildClubPath(data.slug, '/inicio') : '/');
        setChecked(true);
      });
  }, [authLoading, clubLoading, user, perfil, rolReal, clubId]);

  if (!checked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-900">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-400 border-t-transparent" />
      </div>
    );
  }

  if (redirectTo) {
    return <Navigate to={redirectTo} replace />;
  }

  return children;
}
