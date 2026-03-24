import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
  // navigateRef evita que navigate (inestable en RR v7) cause re-runs del effect
  const navigateRef = useRef(navigate);
  useEffect(() => { navigateRef.current = navigate; });

  // Pre-seed desde localStorage para que clubId sea disponible de inmediato
  // en la primera renderización, evitando el spinner bloqueante.
  const [club, setClub] = useState(() => {
    try {
      const savedId = typeof window !== 'undefined'
        ? window.localStorage.getItem(CURRENT_CLUB_ID_STORAGE_KEY)
        : null;
      const savedSlug = typeof window !== 'undefined'
        ? window.localStorage.getItem(CURRENT_CLUB_SLUG_STORAGE_KEY)
        : null;
      if (savedId && savedSlug === clubSlug) {
        return { id: savedId, slug: savedSlug };
      }
    } catch (_) {}
    return null;
  });
  const [loading, setLoading] = useState(true);
  const realtimeChannelRef = useRef(null);

  // Actualiza el plan del club en el estado local sin refetch completo.
  // Llamado por el hook useClubPlanRealtime cuando llega un evento de Supabase Realtime.
  const updateClubPlan = useCallback((newPlan) => {
    setClub((prev) => {
      if (!prev || prev.plan === newPlan) return prev;
      return { ...prev, plan: newPlan };
    });
  }, []);

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
        .select('id, nombre, slug, logo_url, config_visual, plan, white_label')
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
        navigateRef.current('/club-no-encontrado', {
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
        navigateRef.current('/club-no-encontrado', {
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubSlug]);

  // ── Supabase Realtime: escuchar cambios de plan en la tabla clubes ──────────
  // Cuando el webhook de MP actualiza clubes.plan, el evento llega aquí en
  // tiempo real y updateClubPlan actualiza el contexto sin reload de página.
  useEffect(() => {
    const id = club?.id;
    if (!id) return;

    // Si ya hay un canal activo para este club no crear otro
    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current);
    }

    const channel = supabase
      .channel(`club-plan-${id}`)
      .on(
        'postgres_changes',
        {
          event:  'UPDATE',
          schema: 'public',
          table:  'clubes',
          filter: `id=eq.${id}`,
        },
        (payload) => {
          const newPlan = payload.new?.plan;
          if (newPlan) {
            console.log(`[Realtime] Plan del club actualizado: ${newPlan}`);
            updateClubPlan(newPlan);
          }
        },
      )
      .subscribe();

    realtimeChannelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      realtimeChannelRef.current = null;
    };
  }, [club?.id, updateClubPlan]);

  const value = useMemo(() => ({
    club,
    clubId: club?.id || null,
    clubSlug: club?.slug || clubSlug || null,
    clubPlan: club?.plan || 'basico',
    clubWhiteLabel: club?.white_label || false,
    loading,
    updateClubPlan,
  }), [club, clubSlug, loading, updateClubPlan]);

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

  // No bloqueamos el renderizado: los hijos manejan su propio estado de carga
  // via `clubId === null` o `context.loading === true`.
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
