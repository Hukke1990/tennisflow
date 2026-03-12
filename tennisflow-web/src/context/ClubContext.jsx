import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const ClubContext = createContext(null);

export const DEFAULT_CLUB_SLUG = 'demo';
const CURRENT_CLUB_ID_STORAGE_KEY = 'tennisflow.current-club-id';
const CURRENT_CLUB_SLUG_STORAGE_KEY = 'tennisflow.current-club-slug';

const normalizePath = (path = '') => {
  const value = String(path || '').trim();
  if (!value || value === '/') return '';
  return value.startsWith('/') ? value : `/${value}`;
};

export const buildClubPath = (clubSlug, path = '') => {
  const normalizedSlug = String(clubSlug || '').trim();
  const normalizedPath = normalizePath(path);

  if (!normalizedSlug) return normalizedPath || '/';
  return `/${normalizedSlug}${normalizedPath}`;
};

export function ClubProvider({ children }) {
  const { clubSlug } = useParams();
  const navigate = useNavigate();

  const [club, setClub] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const loadClub = async () => {
      const slug = String(clubSlug || '').trim();

      if (!slug) {
        if (!active) return;
        setClub(null);
        setLoading(false);
        return;
      }

      setLoading(true);

      const { data, error } = await supabase
        .from('clubes')
        .select('id, nombre, slug, logo_url, config_visual')
        .eq('slug', slug)
        .maybeSingle();

      if (!active) return;

      if (error) {
        console.error('No se pudo obtener el club por slug:', error);
        if (typeof window !== 'undefined') {
          try {
            window.localStorage.removeItem(CURRENT_CLUB_ID_STORAGE_KEY);
            window.localStorage.removeItem(CURRENT_CLUB_SLUG_STORAGE_KEY);
          } catch (_) {
            // Ignore storage sync errors.
          }
        }
        setClub(null);
        setLoading(false);
        navigate('/club-no-encontrado', {
          replace: true,
          state: { clubSlug: slug },
        });
        return;
      }

      if (!data) {
        if (typeof window !== 'undefined') {
          try {
            window.localStorage.removeItem(CURRENT_CLUB_ID_STORAGE_KEY);
            window.localStorage.removeItem(CURRENT_CLUB_SLUG_STORAGE_KEY);
          } catch (_) {
            // Ignore storage sync errors.
          }
        }
        setClub(null);
        setLoading(false);
        navigate('/club-no-encontrado', {
          replace: true,
          state: { clubSlug: slug },
        });
        return;
      }

      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(CURRENT_CLUB_ID_STORAGE_KEY, String(data.id));
          window.localStorage.setItem(CURRENT_CLUB_SLUG_STORAGE_KEY, String(data.slug));
        } catch (_) {
          // Ignore storage sync errors.
        }
      }

      setClub(data);
      setLoading(false);
    };

    loadClub();

    return () => {
      active = false;
    };
  }, [clubSlug, navigate]);

  const value = useMemo(() => ({
    club,
    clubId: club?.id || null,
    clubSlug: club?.slug || clubSlug || null,
    loading,
  }), [club, clubSlug, loading]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      if (club?.id) {
        window.localStorage.setItem(CURRENT_CLUB_ID_STORAGE_KEY, String(club.id));
      } else {
        window.localStorage.removeItem(CURRENT_CLUB_ID_STORAGE_KEY);
      }

      if (club?.slug) {
        window.localStorage.setItem(CURRENT_CLUB_SLUG_STORAGE_KEY, String(club.slug));
      } else {
        window.localStorage.removeItem(CURRENT_CLUB_SLUG_STORAGE_KEY);
      }
    } catch (_) {
      // Ignore storage sync errors.
    }
  }, [club?.id, club?.slug]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-10 h-10 border-4 border-emerald-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <ClubContext.Provider value={value}>
      {children}
    </ClubContext.Provider>
  );
}

export function useClub() {
  const ctx = useContext(ClubContext);
  if (!ctx) throw new Error('useClub debe usarse dentro de <ClubProvider>');
  return ctx;
}

export function useClubPath() {
  const { clubSlug } = useClub();
  return (path = '') => buildClubPath(clubSlug, path);
}
