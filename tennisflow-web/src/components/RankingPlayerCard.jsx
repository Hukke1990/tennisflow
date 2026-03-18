import { useEffect, useState } from 'react';
import axios from 'axios';
import { resolveProfilePhotoUrl } from '../lib/profilePhoto';
import {
  IconClose,
  IconHand,
  IconPin,
  IconRacket,
  IconRuler,
  IconScale,
  IconStarFill,
} from './icons/UiIcons';

const PLAYER_DETAIL_CACHE = new Map();
const PLAYER_STATS_CACHE = new Map();
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROFILE_UPDATED_EVENT = 'tennisflow:profile-updated';
const PROFILE_UPDATED_STORAGE_KEY = 'tennisflow:profile-updated';

const clearPlayerCaches = (playerId) => {
  const normalizedId = String(playerId || '').trim();
  if (!normalizedId) return;

  PLAYER_STATS_CACHE.delete(normalizedId);

  for (const cacheKey of PLAYER_DETAIL_CACHE.keys()) {
    if (cacheKey.startsWith(`${normalizedId}|`)) {
      PLAYER_DETAIL_CACHE.delete(cacheKey);
    }
  }
};

const parseCategoria = (value) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5) return null;
  return parsed;
};

const getNombreCompleto = (perfil = {}, selectedPlayer = {}) => {
  const nombreBase = String(
    perfil?.nombre_completo
    ?? selectedPlayer?.nombre_completo
    ?? selectedPlayer?.nombre
    ?? ''
  ).trim();
  const apellido = String(
    perfil?.apellido
    ?? selectedPlayer?.apellido
    ?? ''
  ).trim();

  if (nombreBase && apellido && !nombreBase.toLowerCase().includes(apellido.toLowerCase())) {
    return `${nombreBase} ${apellido}`.trim();
  }

  return nombreBase || 'Jugador';
};

const formatFechaNacimiento = (rawValue) => {
  if (!rawValue) return 'Sin dato';

  const parsed = new Date(rawValue);
  if (Number.isNaN(parsed.getTime())) return String(rawValue);

  return parsed.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};

const getInitials = (value) => {
  const source = String(value || '').trim();
  if (!source) return '??';

  return source
    .split(/\s+/)
    .filter(Boolean)
    .map((segment) => segment[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
};

const getRowsFromResponse = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.jugadores)) return payload.jugadores;
  return [];
};

const getId = (value) => String(value?.id ?? value?.jugador_id ?? '').trim();

const toSafeInt = (value, fallback = 0) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const resolveStats = async ({ apiUrl, playerId, selectedPlayer }) => {
  const cacheKey = String(playerId || '');
  if (!cacheKey) {
    return { total_partidos: 0, victorias: 0, win_rate: 0, derrotas: 0 };
  }

  if (PLAYER_STATS_CACHE.has(cacheKey)) {
    return PLAYER_STATS_CACHE.get(cacheKey);
  }

  const fallbackVictorias = toSafeInt(selectedPlayer?.victorias, 0);
  const fallbackStats = {
    total_partidos: 0,
    victorias: fallbackVictorias,
    derrotas: 0,
    win_rate: 0,
  };

  if (!UUID_REGEX.test(cacheKey)) {
    PLAYER_STATS_CACHE.set(cacheKey, fallbackStats);
    return fallbackStats;
  }

  try {
    const { data } = await axios.get(`${apiUrl}/api/dashboard`, {
      params: { jugador_id: cacheKey },
    });

    const stats = data?.estadisticas_jugador || {};
    const total_partidos = toSafeInt(stats?.total_partidos, 0);
    const victorias = toSafeInt(stats?.victorias, fallbackVictorias);
    const derrotas = toSafeInt(stats?.derrotas, Math.max(total_partidos - victorias, 0));
    const computedWinRate = total_partidos > 0
      ? Math.round((victorias / total_partidos) * 100)
      : 0;
    const win_rate = Number.isFinite(Number(stats?.win_rate))
      ? toSafeInt(stats?.win_rate, computedWinRate)
      : computedWinRate;

    const normalized = {
      total_partidos,
      victorias,
      derrotas,
      win_rate: Math.max(0, Math.min(100, win_rate)),
    };

    PLAYER_STATS_CACHE.set(cacheKey, normalized);
    return normalized;
  } catch (_) {
    PLAYER_STATS_CACHE.set(cacheKey, fallbackStats);
    return fallbackStats;
  }
};

const getCategoriaBadgeClasses = (categoria) => {
  if (categoria === 1) return 'text-amber-800 border-amber-300';
  if (categoria === 2) return 'text-sky-800 border-sky-300';
  if (categoria === 3) return 'text-blue-800 border-blue-300';
  if (categoria === 4) return 'text-indigo-800 border-indigo-300';
  if (categoria === 5) return 'text-slate-700 border-slate-300';
  return 'text-slate-700 border-slate-300';
};

function PhysicalStatCard({ icon, label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
      <div className="text-slate-500 mb-1">{icon}</div>
      <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="text-lg sm:text-xl font-black text-slate-900 leading-tight mt-1">{value}</p>
    </div>
  );
}

function StatRing({ percent = 0, label = '' }) {
  const safePercent = Math.max(0, Math.min(100, Number(percent) || 0));
  const ringStyle = {
    background: `conic-gradient(#d4af37 ${safePercent * 3.6}deg, #dbe5f1 0deg)`,
  };

  return (
    <div className="h-14 w-14 rounded-full p-[5px]" style={ringStyle}>
      <div className="h-full w-full rounded-full bg-white flex items-center justify-center text-[11px] font-black text-slate-700">
        {label}
      </div>
    </div>
  );
}

function ShieldBadgeIcon() {
  return (
    <svg viewBox="0 0 64 72" className="h-8 w-8" aria-hidden="true">
      <defs>
        <linearGradient id="shieldGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f8fafc" />
          <stop offset="55%" stopColor="#cbd5e1" />
          <stop offset="100%" stopColor="#94a3b8" />
        </linearGradient>
      </defs>
      <path d="M32 3L58 12V34C58 49 46 62 32 69C18 62 6 49 6 34V12L32 3Z" fill="url(#shieldGradient)" stroke="#64748b" strokeWidth="2" />
      <path d="M32 16L36 26H47L38 32L42 42L32 35L22 42L26 32L17 26H28L32 16Z" fill="#94a3b8" />
    </svg>
  );
}

const fetchRankingPosition = async ({ apiUrl, modalidad, sexo, categoria, playerId }) => {
  if (!categoria) {
    return { categoria: null, posicion: null };
  }

  try {
    const { data } = await axios.get(`${apiUrl}/api/rankings`, {
      params: {
        modalidad,
        sexo,
        categoria,
      },
    });

    const rows = getRowsFromResponse(data);
    const idx = rows.findIndex((row) => getId(row) === playerId);

    return {
      categoria,
      posicion: idx >= 0 ? idx + 1 : null,
    };
  } catch (_) {
    return {
      categoria,
      posicion: null,
    };
  }
};

export default function RankingPlayerCard({
  selectedPlayer,
  sexo,
  modalidad,
  categoria,
  apiUrl,
  compact = false,
  floating = false,
  onClose,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [details, setDetails] = useState(null);
  const [cacheVersion, setCacheVersion] = useState(0);

  const playerId = getId(selectedPlayer);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return () => {};
    }

    const handleProfileUpdated = (payload) => {
      const updatedId = String(payload?.userId || '').trim();
      if (!updatedId) return;

      clearPlayerCaches(updatedId);

      if (updatedId === playerId) {
        setCacheVersion((prev) => prev + 1);
      }
    };

    const handleWindowUpdate = (event) => {
      handleProfileUpdated(event?.detail || null);
    };

    const handleStorageUpdate = (event) => {
      if (event.key !== PROFILE_UPDATED_STORAGE_KEY || !event.newValue) return;

      try {
        const payload = JSON.parse(event.newValue);
        handleProfileUpdated(payload);
      } catch (_) {
        // Ignore malformed payloads from storage.
      }
    };

    window.addEventListener(PROFILE_UPDATED_EVENT, handleWindowUpdate);
    window.addEventListener('storage', handleStorageUpdate);

    return () => {
      window.removeEventListener(PROFILE_UPDATED_EVENT, handleWindowUpdate);
      window.removeEventListener('storage', handleStorageUpdate);
    };
  }, [playerId]);

  useEffect(() => {
    let active = true;

    if (!playerId) {
      setLoading(false);
      setError('');
      setDetails(null);
      return () => {
        active = false;
      };
    }

    const cacheKey = [
      playerId,
      sexo || '',
      modalidad || '',
      String(categoria ?? ''),
    ].join('|');

    if (PLAYER_DETAIL_CACHE.has(cacheKey)) {
      setDetails(PLAYER_DETAIL_CACHE.get(cacheKey));
      setLoading(false);
      setError('');
      return () => {
        active = false;
      };
    }

    const loadPlayerDetails = async () => {
      setLoading(true);
      setError('');

      let perfil = {};
      try {
        const response = await axios.get(`${apiUrl}/api/perfil/${playerId}`);
        perfil = response?.data || {};
      } catch (_) {
        perfil = {};
      }

      const sexoPerfil = String(perfil?.sexo || sexo || 'Masculino');
      const categoriaSingles = parseCategoria(
        perfil?.categoria_singles
        ?? perfil?.categoriaSingles
        ?? perfil?.categoria
        ?? (modalidad === 'Singles' ? categoria : null)
      );
      const categoriaDobles = parseCategoria(
        perfil?.categoria_dobles
        ?? perfil?.categoriaDobles
        ?? perfil?.categoria
        ?? (modalidad === 'Dobles' ? categoria : null)
      );

      const [rankingSingles, rankingDobles, fotoResuelta, stats] = await Promise.all([
        fetchRankingPosition({
          apiUrl,
          modalidad: 'Singles',
          sexo: sexoPerfil,
          categoria: categoriaSingles,
          playerId,
        }),
        fetchRankingPosition({
          apiUrl,
          modalidad: 'Dobles',
          sexo: sexoPerfil,
          categoria: categoriaDobles,
          playerId,
        }),
        resolveProfilePhotoUrl(perfil?.foto_url || selectedPlayer?.foto_url || ''),
        resolveStats({ apiUrl, playerId, selectedPlayer }),
      ]);

      const nextDetails = {
        id: playerId,
        nombreCompleto: getNombreCompleto(perfil, selectedPlayer),
        localidad: String(perfil?.localidad || perfil?.pais || perfil?.country || 'Sin localidad'),
        fechaNacimiento: formatFechaNacimiento(
          perfil?.fecha_nacimiento
          ?? perfil?.fechaNacimiento
          ?? perfil?.nacimiento
          ?? perfil?.birth_date
          ?? null
        ),
        manoDominante: String(perfil?.mano_dominante || 'Sin dato'),
        estiloReves: String(perfil?.estilo_reves || 'Sin dato'),
        altura: perfil?.altura ? `${perfil.altura} cm` : 'Sin dato',
        peso: perfil?.peso ? `${perfil.peso} kg` : 'Sin dato',
        rankingSingles,
        rankingDobles,
        avatarUrl: fotoResuelta || perfil?.foto_url || selectedPlayer?.foto_url || '',
        stats,
      };

      PLAYER_DETAIL_CACHE.set(cacheKey, nextDetails);

      if (!active) return;
      setDetails(nextDetails);
      setLoading(false);
      setError('');
    };

    loadPlayerDetails().catch(() => {
      if (!active) return;
      setLoading(false);
      setError('No se pudo cargar la ficha del jugador.');
    });

    return () => {
      active = false;
    };
  }, [apiUrl, cacheVersion, categoria, modalidad, playerId, selectedPlayer, sexo]);

  if (!playerId) {
    return (
      <div className={`rounded-2xl border border-dashed border-slate-300 bg-white/70 text-slate-500 ${compact ? 'p-4' : 'p-5'} ${floating ? 'shadow-2xl' : ''}`}>
        <p className="text-sm font-semibold">Selecciona un jugador para ver su ficha.</p>
      </div>
    );
  }

  if (loading && !details) {
    return (
      <div className={`rounded-2xl border border-slate-200 bg-white ${compact ? 'p-4' : 'p-5'} animate-pulse ${floating ? 'shadow-2xl' : ''}`}>
        <div className="h-5 w-36 rounded bg-slate-100 mb-4" />
        <div className="h-20 rounded-xl bg-slate-100 mb-3" />
        <div className="h-20 rounded-xl bg-slate-100" />
      </div>
    );
  }

  if (error && !details) {
    return (
      <div className={`rounded-2xl border border-rose-200 bg-rose-50 text-rose-700 ${compact ? 'p-4' : 'p-5'} ${floating ? 'shadow-2xl' : ''}`}>
        <p className="text-sm font-semibold">{error}</p>
      </div>
    );
  }

  const data = details || {};
  const rankingSingles = data?.rankingSingles || { categoria: null, posicion: null };
  const rankingDobles = data?.rankingDobles || { categoria: null, posicion: null };
  const categoriaSingles = toSafeInt(rankingSingles?.categoria, 0);
  const categoriaDobles = toSafeInt(rankingDobles?.categoria, 0);

  const stats = data?.stats || {
    total_partidos: 0,
    victorias: 0,
    derrotas: 0,
    win_rate: 0,
  };

  const eficacia = Math.max(0, Math.min(100, toSafeInt(stats?.win_rate, 0)));
  const victoriasPercent = stats?.total_partidos > 0
    ? Math.round((stats.victorias / stats.total_partidos) * 100)
    : 0;
  const cardPadding = compact ? 'p-3 sm:p-3.5' : 'p-3.5 sm:p-4';
  const headerBottomPadding = compact ? 'pb-4 sm:pb-20' : 'pb-4 sm:pb-24';
  const headerTextOffset = compact ? 'ml-24 sm:ml-48' : 'ml-24 sm:ml-56';
  const avatarSizeClass = compact ? 'h-28 w-28 sm:h-36 sm:w-36' : 'h-28 w-28 sm:h-44 sm:w-44';
  const avatarBottomClass = compact ? '-bottom-12 sm:-bottom-20' : '-bottom-12 sm:-bottom-24';
  const rankingAsideOffset = compact ? 'sm:ml-44' : 'sm:ml-56';
  const contentTopPadding = compact ? 'pt-3 sm:pt-8' : 'pt-3 sm:pt-10';
  const rankingLiftClass = compact ? 'sm:-mt-16' : 'sm:-mt-20';

  return (
    <div
      className={`w-full max-w-full box-border rounded-3xl border border-slate-200 bg-white ${floating ? 'shadow-2xl ring-1 ring-slate-200 max-h-[84vh] overflow-y-auto overflow-x-hidden' : 'overflow-hidden shadow-sm'}`}
      style={{ fontFamily: 'Inter, Roboto, system-ui, sans-serif' }}
    >
      <div className={`relative px-4 sm:px-5 pt-3.5 sm:pt-4.5 ${headerBottomPadding} bg-gradient-to-r from-slate-950 via-blue-900 to-sky-800 text-white`}>
        <div
          className="absolute inset-0 opacity-20 pointer-events-none"
          style={{ backgroundImage: 'repeating-linear-gradient(135deg, rgba(255,255,255,0.16) 0px, rgba(255,255,255,0.16) 1px, transparent 1px, transparent 14px)' }}
        />
        <div className="absolute -right-8 -top-8 text-[130px] leading-none text-amber-200/10 pointer-events-none">★</div>

        {onClose ? (
          <button
            type="button"
            onClick={() => onClose?.()}
            className="absolute top-3 right-3 z-30 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/30 bg-white/10 text-white hover:bg-white/20 transition-colors"
            aria-label="Cerrar ficha"
          >
            <IconClose className="h-4 w-4" />
          </button>
        ) : null}

        {/* Mobile: avatar inline con nombre en fila (oculto en sm+) */}
        <div className="relative z-10 flex items-center gap-3 sm:hidden pr-10 py-2">
          <div className="h-14 w-14 shrink-0 rounded-full p-[2px] bg-gradient-to-br from-[#f7e9aa] via-[#d4af37] to-[#8f6a16] shadow-lg">
            <div className="h-full w-full rounded-full p-[3px] bg-gradient-to-br from-[#f4e8bf] to-[#d1ac43]">
              <div className="h-full w-full rounded-full overflow-hidden ring-2 ring-[#f9f0d0] bg-slate-100">
                {data.avatarUrl ? (
                  <img src={data.avatarUrl} alt={data.nombreCompleto} className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-black text-lg flex items-center justify-center">
                    {getInitials(data.nombreCompleto)}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-sky-100/80">Ficha del jugador</p>
            <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
              <h3 className="text-xl font-black leading-tight truncate">{data.nombreCompleto}</h3>
              {(rankingSingles.posicion === 1 || rankingDobles.posicion === 1) && (
                <span className="inline-flex items-center rounded-full bg-amber-400/25 border border-amber-300/60 px-1.5 py-0.5 text-[10px] font-black text-amber-200 leading-none">
                  ★ #1
                </span>
              )}
            </div>
            <p className="text-xs text-sky-100 flex items-center gap-1 truncate mt-0.5">
              <IconPin className="h-3 w-3 text-amber-200 shrink-0" />
              <span className="truncate">{data.localidad}</span>
            </p>
          </div>
        </div>

        {/* Desktop: texto con offset para el avatar desbordado (oculto en mobile) */}
        <div className={`relative z-10 hidden sm:block ${headerTextOffset} pr-8 sm:pr-10`}>
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-sky-100/80">Ficha del jugador</p>
          <h3 className="mt-1 text-2xl sm:text-4xl font-black leading-[1.02] truncate">{data.nombreCompleto}</h3>
          <p className="mt-1 sm:mt-1.5 text-sm sm:text-lg text-sky-100 flex items-center gap-1.5 truncate">
            <IconPin className="h-4 w-4 text-amber-200" />
            <span>{data.localidad}</span>
          </p>
        </div>

        {/* Desktop: avatar desbordado (oculto en mobile) */}
        <div className={`hidden sm:block absolute left-4 sm:left-5 ${avatarBottomClass} z-20`}>
          <div className={`${avatarSizeClass} rounded-full p-[3px] bg-gradient-to-br from-[#f7e9aa] via-[#d4af37] to-[#8f6a16] shadow-[0_14px_24px_rgba(15,23,42,0.32)]`}>
            <div className="h-full w-full rounded-full p-[4px] bg-gradient-to-br from-[#f4e8bf] to-[#d1ac43]">
              <div className="h-full w-full rounded-full overflow-hidden ring-2 ring-[#f9f0d0] bg-slate-100">
                {data.avatarUrl ? (
                  <img
                    src={data.avatarUrl}
                    alt={data.nombreCompleto}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="h-full w-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-black text-xl sm:text-3xl flex items-center justify-center">
                    {getInitials(data.nombreCompleto)}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={`${cardPadding} relative ${contentTopPadding} space-y-3 bg-white`}>
        <div className="absolute left-3 top-20 h-8 w-8 border border-amber-200/70 rounded-sm pointer-events-none opacity-70" />
        <div className="absolute right-4 top-28 h-8 w-8 border border-sky-200/80 rounded-sm pointer-events-none opacity-70" />

        <div className={`${rankingAsideOffset} ${rankingLiftClass} relative z-20 rounded-2xl border border-slate-200 overflow-hidden shadow-md`}>
          <div className="grid grid-cols-2">
            {/* ── Singles (dorado) — mitad izquierda ── */}
            <div className="flex flex-col items-center justify-start gap-1.5 px-3 py-4 bg-gradient-to-br from-[#9b7422] via-[#d9b857] to-[#f2df9c] text-slate-950">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#0b3f73] to-[#012849] flex items-center justify-center shadow text-amber-300">
                <IconStarFill className="h-5 w-5" />
              </div>
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-900/70 text-center">Singles</p>
              <p className="text-4xl sm:text-[46px] leading-none font-black text-center">
                {rankingSingles.posicion ? `#${rankingSingles.posicion}` : '---'}
              </p>
              {rankingSingles.categoria ? (
                <span className={`inline-flex rounded-full border bg-white/90 px-2.5 py-1 text-xs font-black ${getCategoriaBadgeClasses(categoriaSingles)}`}>
                  Categoria {rankingSingles.categoria}a
                </span>
              ) : (
                <span className="inline-flex rounded-full border border-slate-300 bg-white/85 px-2.5 py-1 text-xs font-black text-slate-700">
                  No participa
                </span>
              )}
            </div>

            {/* ── Dobles (azul) — mitad derecha ── */}
            <div className="flex flex-col items-center justify-start gap-1.5 px-3 py-4 bg-gradient-to-bl from-[#0e3157] via-[#1a5689] to-[#2f8ec6] text-white border-l border-white/20">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#f8fafc] to-[#cbd5e1] flex items-center justify-center shadow">
                <ShieldBadgeIcon />
              </div>
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-sky-100 text-center">Dobles</p>
              <p className="text-4xl sm:text-[46px] leading-none font-black text-center">
                {rankingDobles.posicion ? `#${rankingDobles.posicion}` : '---'}
              </p>
              {rankingDobles.categoria ? (
                <span className={`inline-flex rounded-full border bg-white/95 px-2.5 py-1 text-xs font-black ${getCategoriaBadgeClasses(categoriaDobles)}`}>
                  Categoria {rankingDobles.categoria}a
                </span>
              ) : (
                <span className="inline-flex rounded-full border border-white/35 bg-white/15 px-2.5 py-1 text-xs font-black text-white">
                  No participa
                </span>
              )}
            </div>

          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
          <PhysicalStatCard icon={<IconRuler className="h-5 w-5" />} label="Altura" value={data.altura} />
          <PhysicalStatCard icon={<IconScale className="h-5 w-5" />} label="Peso" value={data.peso} />
          <PhysicalStatCard icon={<IconHand className="h-5 w-5" />} label="Mano" value={data.manoDominante} />
          <PhysicalStatCard icon={<IconRacket className="h-5 w-5" />} label="Reves" value={data.estiloReves} />
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-3">
          <p className="text-sm font-black uppercase tracking-[0.14em] text-slate-700 mb-2.5">Estadisticas rapidas</p>
          <div className="grid grid-cols-3 gap-1.5 sm:gap-3">
            <div className="rounded-xl bg-white border border-slate-200 px-2 py-2 sm:px-3 sm:py-2.5">
              <p className="text-[9px] sm:text-[11px] uppercase tracking-[0.06em] sm:tracking-[0.12em] text-slate-500 font-black leading-tight">Partidos</p>
              <p className="text-xl sm:text-2xl font-black text-slate-900 mt-1">{stats.total_partidos}</p>
            </div>

            <div className="rounded-xl bg-white border border-slate-200 px-2 py-2 sm:px-3 sm:py-2.5 flex items-center justify-between gap-1 sm:gap-2">
              <div>
                <p className="text-[9px] sm:text-[11px] uppercase tracking-[0.06em] sm:tracking-[0.12em] text-slate-500 font-black leading-tight">Victorias</p>
                <p className="text-xl sm:text-2xl font-black text-slate-900 mt-1">{stats.victorias}</p>
              </div>
              <div className="hidden sm:block shrink-0">
                <StatRing percent={victoriasPercent} label={`${victoriasPercent}%`} />
              </div>
            </div>

            <div className="rounded-xl bg-white border border-slate-200 px-2 py-2 sm:px-3 sm:py-2.5 flex items-center justify-between gap-1 sm:gap-2">
              <div>
                <p className="text-[9px] sm:text-[11px] uppercase tracking-[0.06em] sm:tracking-[0.12em] text-slate-500 font-black leading-tight">Eficacia</p>
                <p className="text-xl sm:text-2xl font-black text-slate-900 mt-1">{eficacia}%</p>
              </div>
              <div className="hidden sm:block shrink-0">
                <StatRing percent={eficacia} label="Win" />
              </div>
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-500">Nacimiento: {data.fechaNacimiento}</p>
        </div>
      </div>
    </div>
  );
}
