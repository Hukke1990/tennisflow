import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { resolveProfilePhotoUrl } from '../lib/profilePhoto';

const AuthContext = createContext(null);
const VIEW_AS_PLAYER_STORAGE_KEY = 'tennisflow.view-as-player';

const readViewAsPlayerPreference = () => {
  if (typeof window === 'undefined') return false;

  try {
    return window.localStorage.getItem(VIEW_AS_PLAYER_STORAGE_KEY) === '1';
  } catch (_) {
    return false;
  }
};

const persistViewAsPlayerPreference = (value) => {
  if (typeof window === 'undefined') return;

  try {
    if (value) {
      window.localStorage.setItem(VIEW_AS_PLAYER_STORAGE_KEY, '1');
      return;
    }

    window.localStorage.removeItem(VIEW_AS_PLAYER_STORAGE_KEY);
  } catch (_) {
    // Ignore storage sync errors.
  }
};

const normalizeRole = (value) => {
  if (value === true) return 'admin';
  if (value === false || value === null || value === undefined || value === '') return '';

  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'super_admin' || normalized === 'superadmin') return 'super_admin';
  if (normalized === 'admin' || normalized === 'administrador') return 'admin';
  if (normalized === 'jugador' || normalized === 'player') return 'jugador';
  return '';
};

const resolveUserRole = ({ perfil, user }) => {
  const candidates = [
    perfil?.rol,
    perfil?.role,
    perfil?.tipo_usuario,
    perfil?.es_admin,
    user?.user_metadata?.rol,
    user?.user_metadata?.role,
  ];

  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null || candidate === '') continue;
    const resolved = normalizeRole(candidate);
    if (resolved) return resolved;
  }

  return 'jugador';
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [loading, setLoading] = useState(true);
  const [viewAsPlayerPreference, setViewAsPlayerPreference] = useState(() => readViewAsPlayerPreference());

  // Cargar perfil extendido desde la tabla perfiles + membresías multi-club.
  const cargarPerfil = async (userId) => {
    if (!userId) {
      setPerfil(null);
      return null;
    }

    const [{ data }, { data: clubes }] = await Promise.all([
      supabase.from('perfiles').select('*').eq('id', userId).single(),
      supabase.from('usuario_clubes').select('club_id').eq('user_id', userId),
    ]);

    if (!data) {
      setPerfil(null);
      return null;
    }

    const foto_url_resolved = await resolveProfilePhotoUrl(data.foto_url || '');

    // Construir lista unificada de club IDs (primario + multi-tenancy)
    const clubIds = (clubes || []).map(c => String(c.club_id));
    if (data.club_id && !clubIds.includes(String(data.club_id))) {
      clubIds.push(String(data.club_id));
    }

    const nextPerfil = { ...data, foto_url_resolved, clubIds };
    setPerfil(nextPerfil);
    return nextPerfil;
  };

  const refreshPerfil = async () => {
    await cargarPerfil(user?.id ?? null);
  };

  useEffect(() => {
    let active = true;
    // Cada llamada a syncSession obtiene un ID único. Si una nueva llamada llega
    // antes de que la anterior termine (ej: SIGNED_IN + SIGNED_OUT en rápida
    // sucesión), la llamada vieja descarta sus resultados al completar.
    let currentSyncId = 0;

    const syncSession = async (session) => {
      if (!active) return;

      const syncId = ++currentSyncId;

      setUser(session?.user ?? null);

      await cargarPerfil(session?.user?.id ?? null);

      // Si llegó una syncSession más reciente mientras esperábamos cargarPerfil,
      // no pisamos el estado con datos stale.
      if (!active || syncId !== currentSyncId) return;

      setLoading(false);
    };

    // Obtener sesión actual al montar.
    supabase.auth.getSession().then(({ data: { session } }) => {
      // Si la URL contiene tokens de confirmación de email en el hash, getSession()
      // puede retornar null porque los tokens aún no fueron procesados por el cliente.
      // En ese caso mantenemos loading=true y esperamos a que onAuthStateChange
      // resuelva la sesión real. Si no dispara en 5s (tokens inválidos u otro error),
      // un timeout de seguridad llama a syncSession(null) para salir del loading.
      if (!session) {
        const hasHashTokens =
          typeof window !== 'undefined' &&
          window.location.hash.includes('access_token');

        if (hasHashTokens) {
          const safetyTimer = setTimeout(() => {
            if (active) syncSession(null);
          }, 5000);
          // onAuthStateChange limpiará el loading cuando dispare; si lo hace
          // antes de que el timer venza, el timer llama syncSession de nuevo pero
          // de forma idempotente (solo actualiza estado ya resuelto).
          void safetyTimer;
          return;
        }
      }

      syncSession(session);
    });

    // Escuchar cambios de sesión (login, logout, refresh de token, etc.).
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // Supabase v2 dispara INITIAL_SESSION con session=null antes de procesar
      // los hash tokens del link de confirmación de email.
      if (event === 'INITIAL_SESSION' && !session) {
        const hasHashTokens =
          typeof window !== 'undefined' &&
          window.location.hash.includes('access_token');
        if (hasHashTokens) return;
      }

      // Cuando el usuario llega desde el email de recuperación de contraseña,
      // Supabase puede redirigir a la URL base del sitio (/#) si la redirectTo
      // no está en la lista de URLs permitidas. Detectamos el evento aquí y
      // redirigimos al usuario a la página de nueva contraseña del club correcto.
      if (event === 'PASSWORD_RECOVERY' && typeof window !== 'undefined') {
        const alreadyOnRecoveryPage = window.location.pathname.includes('nueva-contrasenia');
        if (!alreadyOnRecoveryPage) {
          let clubSlug = '';
          try {
            clubSlug = window.localStorage.getItem('tennisflow.current-club-slug') || '';
          } catch (_) {}
          const recoveryPath = clubSlug ? `/${clubSlug}/nueva-contrasenia` : null;
          if (recoveryPath) {
            window.location.replace(recoveryPath);
            return;
          }
        }
      }

      syncSession(session);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setPerfil(null);
    setViewAsPlayerPreference(false);
    persistViewAsPlayerPreference(false);
  };

  const signIn = async (email, password, clubId) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { data: null, error };

    if (clubId) {
      const [{ data: profile }, { data: membership }] = await Promise.all([
        supabase.from('perfiles').select('club_id, rol').eq('id', data.user.id).maybeSingle(),
        supabase.from('usuario_clubes').select('club_id')
          .eq('user_id', data.user.id).eq('club_id', clubId).maybeSingle(),
      ]);

      const rol = String(profile?.rol || '').toLowerCase();
      // Multi-tenancy: verificar tanto club primario como tabla de membresías
      const esDelClub = membership?.club_id || String(profile?.club_id || '') === String(clubId);

      if (rol !== 'super_admin' && !esDelClub) {
        await supabase.auth.signOut();
        return { data: null, error: new Error('WRONG_CLUB') };
      }
    }

    return { data, error: null };
  };

  const rolReal = resolveUserRole({ perfil, user });
  const isAdminReal = rolReal === 'admin' || rolReal === 'super_admin';
  const viewAsJugador = isAdminReal && viewAsPlayerPreference;
  const rol = viewAsJugador ? 'jugador' : rolReal;
  const isAdmin = rol === 'admin' || rol === 'super_admin';

  useEffect(() => {
    if (loading) return;

    if (!user && viewAsPlayerPreference) {
      setViewAsPlayerPreference(false);
      persistViewAsPlayerPreference(false);
      return;
    }

    if (user && !isAdminReal && viewAsPlayerPreference) {
      setViewAsPlayerPreference(false);
      persistViewAsPlayerPreference(false);
    }
  }, [loading, user, isAdminReal, viewAsPlayerPreference]);

  const setViewAsJugador = (nextValue) => {
    setViewAsPlayerPreference((prev) => {
      const resolved = typeof nextValue === 'function' ? nextValue(prev) : nextValue;
      const normalized = Boolean(resolved);
      persistViewAsPlayerPreference(normalized);
      return normalized;
    });
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        perfil,
        loading,
        signOut,
        signIn,
        refreshPerfil,
        rol,
        rolReal,
        isAdmin,
        isAdminReal,
        viewAsJugador,
        setViewAsJugador,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// Hook de acceso rápido
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
