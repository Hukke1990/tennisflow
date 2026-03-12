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

  // Cargar perfil extendido desde la tabla perfiles.
  const cargarPerfil = async (userId) => {
    if (!userId) {
      setPerfil(null);
      return null;
    }

    const { data } = await supabase.from('perfiles').select('*').eq('id', userId).single();
    if (!data) {
      setPerfil(null);
      return null;
    }

    const foto_url_resolved = await resolveProfilePhotoUrl(data.foto_url || '');
    const nextPerfil = { ...data, foto_url_resolved };
    setPerfil(nextPerfil);
    return nextPerfil;
  };

  const refreshPerfil = async () => {
    await cargarPerfil(user?.id ?? null);
  };

  useEffect(() => {
    let active = true;

    const syncSession = async (session) => {
      if (!active) return;

      setUser(session?.user ?? null);
      await cargarPerfil(session?.user?.id ?? null);

      if (active) {
        setLoading(false);
      }
    };

    // Obtener sesión actual al montar.
    supabase.auth.getSession().then(({ data: { session } }) => {
      syncSession(session);
    });

    // Escuchar cambios de sesión (login, logout, refresh).
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
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
