import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import { resolveProfilePhotoUrl } from '../lib/profilePhoto';
import RankingPlayerCard from '../components/RankingPlayerCard';
import { useAuth } from '../context/AuthContext';
import { useClub } from '../context/ClubContext';
import {
  IconMedal,
  IconSearch,
  IconTennisBall,
  IconTrophy,
  IconUser,
} from '../components/icons/UiIcons';

const API_URL = '';

const MODALIDADES = ['Singles', 'Dobles'];
const SEXOS = [
  { value: 'Masculino', label: 'Caballeros' },
  { value: 'Femenino', label: 'Damas' },
];
const CATEGORIAS = ['1', '2', '3', '4', '5'];
const PERFIL_NOMBRE_CACHE = new Map();
const MODALIDAD_OPTIONS = [
  { value: 'Singles', label: 'Singles', icon: IconTennisBall, accent: 'text-emerald-500' },
  { value: 'Dobles', label: 'Dobles', icon: IconTennisBall, accent: 'text-cyan-500' },
];
const SEXO_OPTIONS = [
  { value: 'Masculino', label: 'Caballeros', icon: IconUser, accent: 'text-sky-500' },
  { value: 'Femenino', label: 'Damas', icon: IconUser, accent: 'text-rose-500' },
];
const CATEGORIA_OPTIONS = CATEGORIAS.map((c) => ({ value: c, label: `${c}a` }));

const CATEGORY_TONES = {
  '1': { badge: 'bg-blue-600 text-white border-blue-600', dot: 'bg-blue-500' },
  '2': { badge: 'bg-emerald-500 text-white border-emerald-500', dot: 'bg-emerald-500' },
  '3': { badge: 'bg-green-500 text-white border-green-500', dot: 'bg-green-500' },
  '4': { badge: 'bg-amber-500 text-[#1f2937] border-amber-500', dot: 'bg-amber-500' },
  '5': { badge: 'bg-rose-500 text-white border-rose-500', dot: 'bg-rose-500' },
  default: { badge: 'bg-slate-500 text-white border-slate-500', dot: 'bg-slate-500' },
};

const TREND_FIELDS = [
  'variacion_posicion',
  'variacion',
  'ranking_variacion',
  'posicion_variacion',
  'trend',
  'delta',
];

const PREVIOUS_POSITION_FIELDS = [
  'posicion_anterior',
  'ranking_anterior',
  'posicion_previa',
  'previous_position',
  'prev_position',
  'anterior',
];

const getPuntosByModalidad = (jugador, modalidad) => {
  if (modalidad === 'Dobles') {
    return Number(
      jugador?.ranking_puntos_dobles
      ?? jugador?.ranking_puntos
      ?? jugador?.puntos
      ?? 0
    );
  }

  return Number(
    jugador?.ranking_puntos_singles
    ?? jugador?.ranking_puntos
    ?? jugador?.puntos
    ?? 0
  );
};

const getNombreJugador = (jugador) => {
  const nombre = String(
    jugador?.nombre
    ?? jugador?.nombres
    ?? jugador?.first_name
    ?? jugador?.firstname
    ?? ''
  ).trim();
  const apellido = String(
    jugador?.apellido
    ?? jugador?.apellidos
    ?? jugador?.last_name
    ?? jugador?.lastname
    ?? jugador?.surname
    ?? ''
  ).trim();
  const nombreCompleto = String(
    jugador?.nombre_completo
    ?? jugador?.full_name
    ?? ''
  ).trim();

  if (nombre && apellido) return `${nombre} ${apellido}`;
  if (nombreCompleto && apellido && !nombreCompleto.toLowerCase().includes(apellido.toLowerCase())) {
    return `${nombreCompleto} ${apellido}`.trim();
  }

  return nombreCompleto || [nombre, apellido].filter(Boolean).join(' ').trim() || 'Jugador';
};

const tieneApellidoEnNombre = (nombre) => String(nombre || '').trim().split(/\s+/).filter(Boolean).length >= 2;

const resolverNombreCompletoPorPerfil = async (jugador, fallbackNombre, clubId) => {
  const id = jugador?.id || jugador?.jugador_id;
  if (!id || tieneApellidoEnNombre(fallbackNombre)) return fallbackNombre;
  const cacheKey = `${String(clubId || '')}:${String(id)}`;

  if (PERFIL_NOMBRE_CACHE.has(cacheKey)) {
    return PERFIL_NOMBRE_CACHE.get(cacheKey) || fallbackNombre;
  }

  try {
    const { data } = await axios.get(`${API_URL}/api/perfil/${id}`, { params: { club_id: clubId } });
    const nombrePerfil = getNombreJugador(data);
    const nombreFinal = nombrePerfil || fallbackNombre;
    PERFIL_NOMBRE_CACHE.set(cacheKey, nombreFinal);
    return nombreFinal;
  } catch (_) {
    PERFIL_NOMBRE_CACHE.set(cacheKey, fallbackNombre);
    return fallbackNombre;
  }
};

const resolveCategoriaJugador = (jugador, modalidad, categoriaFallback) => {
  const categoriaRaw = modalidad === 'Dobles'
    ? (jugador?.categoria_dobles ?? jugador?.categoria ?? categoriaFallback)
    : (jugador?.categoria_singles ?? jugador?.categoria ?? categoriaFallback);

  const parsed = String(categoriaRaw ?? categoriaFallback ?? '').replace(/[^0-9]/g, '');
  return parsed || String(categoriaFallback || '3');
};

const resolveTrendDelta = (jugador, posicionActual, victoriasPromedio) => {
  for (const key of TREND_FIELDS) {
    const value = Number(jugador?.[key]);
    if (Number.isFinite(value) && value !== 0) return value;
  }

  for (const key of PREVIOUS_POSITION_FIELDS) {
    const previous = Number(jugador?.[key]);
    if (Number.isFinite(previous) && previous > 0) {
      return previous - posicionActual;
    }
  }

  // Fallback suave cuando el backend no aporta variacion historica.
  if (jugador.victorias >= victoriasPromedio + 1) return 1;
  if (jugador.victorias <= victoriasPromedio - 1) return -1;
  return 0;
};

const getTrendDirection = (delta) => {
  if (delta > 0) return 'up';
  if (delta < 0) return 'down';
  return 'flat';
};

function TrendIndicator({ direction }) {
  if (direction === 'up') {
    return (
      <span className="inline-flex items-center justify-center h-6 min-w-[24px] rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
        <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M4 12l6-6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }

  if (direction === 'down') {
    return (
      <span className="inline-flex items-center justify-center h-6 min-w-[24px] rounded-full bg-rose-100 text-rose-700 border border-rose-200">
        <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="m4 8 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center justify-center h-6 min-w-[24px] rounded-full bg-slate-100 text-slate-500 border border-slate-200">
      <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M5 10h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function FilterDropdown({ id, label, value, options, openFilter, onToggle, onSelect }) {
  const isOpen = openFilter === id;
  const selected = options.find((option) => option.value === value) || options[0];

  const renderOptionLeading = (option) => {
    if (id === 'categoria') {
      return (
        <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-md bg-[#edf5ff] text-[#0f4c81] text-[11px] font-black border border-[#c5dbf2]">
          {option.value}
        </span>
      );
    }

    if (option.icon) {
      const Icon = option.icon;
      return <Icon className={`h-4 w-4 ${option.accent || 'text-[#0f4c81]'}`} />;
    }

    return null;
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => onToggle(isOpen ? '' : id)}
        className={`w-full rounded-xl border px-3 py-2.5 text-left backdrop-blur-md transition-all ${isOpen ? 'border-[#0f4c81]/45 bg-white/88 shadow-md shadow-[#0f4c81]/15' : 'border-white/35 bg-white/72 hover:bg-white/84'}`}
      >
        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</p>
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2 text-sm font-bold text-slate-800">
            {renderOptionLeading(selected)}
            {selected?.label}
          </span>
          <svg viewBox="0 0 20 20" className={`h-4 w-4 text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="m5 7 5 6 5-6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </button>

      {isOpen ? (
        <div className="absolute z-[90] mt-1.5 w-full rounded-xl border border-slate-200 bg-white/96 p-1.5 shadow-lg shadow-slate-900/10 backdrop-blur-md">
          {options.map((option) => (
            <button
              key={`${id}-${option.value}`}
              type="button"
              onClick={() => {
                onSelect(option.value);
                onToggle('');
              }}
              className={`w-full rounded-lg px-2.5 py-2 text-left transition-colors inline-flex items-center gap-2 text-sm ${option.value === value ? 'bg-[#edf5ff] text-[#0f4c81] font-bold' : 'text-slate-700 hover:bg-slate-50'}`}
            >
              {renderOptionLeading(option)}
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function RankingsPage() {
  const { user } = useAuth();
  const { clubId } = useClub();
  const [modalidad, setModalidad] = useState('Singles');
  const [sexo, setSexo] = useState('Masculino');
  const [categoria, setCategoria] = useState('1');
  const [searchDraft, setSearchDraft] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [openFilter, setOpenFilter] = useState('');

  const [jugadores, setJugadores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [avatarErrors, setAvatarErrors] = useState({});
  const [rankingRefreshNonce, setRankingRefreshNonce] = useState(0);
  const [selectedPlayerId, setSelectedPlayerId] = useState('');
  const filtersRef = useRef(null);

  const sexoLabel = SEXOS.find((s) => s.value === sexo)?.label || sexo;

  useEffect(() => {
    let active = true;

    const fetchRankings = async () => {
      if (!clubId) {
        if (!active) return;
        setJugadores([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');

      try {
        const { data } = await axios.get(`${API_URL}/api/rankings`, {
          params: {
            modalidad,
            sexo,
            categoria,
            club_id: clubId,
          },
        });

        const rawJugadores = Array.isArray(data)
          ? data
          : Array.isArray(data?.jugadores)
            ? data.jugadores
            : [];

        const mapped = await Promise.all(
          rawJugadores.map(async (jugador, index) => {
            const fotoRaw = jugador?.foto_url || '';
            const fotoResuelta = fotoRaw ? await resolveProfilePhotoUrl(fotoRaw) : '';
            const nombreBase = getNombreJugador(jugador);
            const nombreFinal = await resolverNombreCompletoPorPerfil(jugador, nombreBase, clubId);

            return {
              id: jugador?.id || jugador?.jugador_id || `${nombreBase}-${index}`,
              nombre: nombreFinal,
              puntos: getPuntosByModalidad(jugador, modalidad),
              torneos: Number(jugador?.torneos ?? jugador?.torneos_jugados ?? jugador?.total_torneos ?? 0),
              victorias: Number(jugador?.victorias ?? jugador?.partidos_ganados ?? 0),
              foto_url: fotoResuelta || fotoRaw,
              categoriaJugador: resolveCategoriaJugador(jugador, modalidad, categoria),
              companeroHabitual: jugador?.companero_habitual_nombre ?? null,
              companeroHabitualId: jugador?.companero_habitual_id ?? null,
              rawTrend: TREND_FIELDS.reduce((acc, field) => {
                if (acc !== null) return acc;
                const value = Number(jugador?.[field]);
                return Number.isFinite(value) && value !== 0 ? value : null;
              }, null),
              previousPosition: PREVIOUS_POSITION_FIELDS.reduce((acc, field) => {
                if (acc !== null) return acc;
                const value = Number(jugador?.[field]);
                return Number.isFinite(value) && value > 0 ? value : null;
              }, null),
            };
          })
        );

        mapped.sort((a, b) => {
          if (b.puntos !== a.puntos) return b.puntos - a.puntos;

          const aName = String(a?.nombre || '').trim().toLowerCase();
          const bName = String(b?.nombre || '').trim().toLowerCase();
          if (aName !== bName) return aName.localeCompare(bName);

          return String(a?.id || '').localeCompare(String(b?.id || ''));
        });
        const victoriasPromedio = mapped.length > 0
          ? mapped.reduce((acc, jugador) => acc + Number(jugador.victorias || 0), 0) / mapped.length
          : 0;

        const ranked = mapped.map((j, i) => {
          const pos = i + 1;
          const trendDelta = j.rawTrend ?? (j.previousPosition ? j.previousPosition - pos : resolveTrendDelta(j, pos, victoriasPromedio));
          return {
            ...j,
            pos,
            trendDelta,
            trendDirection: getTrendDirection(trendDelta),
          };
        });

        if (!active) return;
        setJugadores(ranked);
        setAvatarErrors({});
        setSelectedPlayerId((prev) => (
          ranked.some((jugador) => String(jugador.id) === String(prev))
            ? prev
            : ''
        ));
      } catch (_) {
        if (!active) return;
        setJugadores([]);
        setSelectedPlayerId('');
        setError('No se pudo cargar el ranking con los filtros seleccionados.');
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchRankings();

    return () => {
      active = false;
    };
  }, [modalidad, sexo, categoria, rankingRefreshNonce, clubId]);

  useEffect(() => {
    const requestRefresh = () => {
      setRankingRefreshNonce((prev) => prev + 1);
    };

    const socket = io(API_URL, { transports: ['websocket', 'polling'] });
    socket.on('ranking_actualizado', requestRefresh);

    return () => {
      socket.off('ranking_actualizado', requestRefresh);
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!filtersRef.current) return;
      if (!filtersRef.current.contains(event.target)) {
        setOpenFilter('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedPlayer = jugadores.find((jugador) => String(jugador.id) === String(selectedPlayerId)) || null;
  const displayJugadores = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return jugadores;

    return jugadores.filter((jugador) => {
      const nombre = String(jugador?.nombre || '').toLowerCase();
      const cat = String(jugador?.categoriaJugador || '').toLowerCase();
      return nombre.includes(query) || cat.includes(query);
    });
  }, [jugadores, searchTerm]);

  const topThree = useMemo(() => displayJugadores.slice(0, 3), [displayJugadores]);
  const podiumOrder = useMemo(() => {
    const byPos = new Map(topThree.map((jugador) => [jugador.pos, jugador]));
    return [byPos.get(2), byPos.get(1), byPos.get(3)].filter(Boolean);
  }, [topThree]);

  // Detect players in podium/table that form a current pair (same points + mutual partnership)
  const parejaActualIds = useMemo(() => {
    if (modalidad !== 'Dobles') return new Set();
    const result = new Set();
    for (let i = 0; i < topThree.length; i++) {
      for (let k = i + 1; k < topThree.length; k++) {
        const a = topThree[i];
        const b = topThree[k];
        if (a.puntos !== b.puntos) continue;
        const linked =
          (a.companeroHabitualId && a.companeroHabitualId === b.id) ||
          (b.companeroHabitualId && b.companeroHabitualId === a.id) ||
          (a.companeroHabitual && a.companeroHabitual === b.nombre) ||
          (b.companeroHabitual && b.companeroHabitual === a.nombre);
        if (linked) {
          result.add(String(a.id));
          result.add(String(b.id));
        }
      }
    }
    return result;
  }, [topThree, modalidad]);

  const renderPosicion = (posicion) => {
    if (posicion === 1) return <IconMedal tone="gold" className="h-5 w-5" />;
    if (posicion === 2) return <IconMedal tone="silver" className="h-5 w-5" />;
    if (posicion === 3) return <IconMedal tone="bronze" className="h-5 w-5" />;
    return <span className="font-black text-slate-500">#{posicion}</span>;
  };

  const currentUserId = String(user?.id || '');

  return (
    <div className="max-w-6xl mx-auto space-y-6 rounded-3xl bg-gradient-to-b from-[#f7fbff] via-[#f8fafc] to-[#f6f1df] p-2 sm:p-3 overflow-visible">
      <div className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-black text-[#0f4c81] tracking-tight">Rankings</h1>
        <p className="text-slate-600 mt-1">Leaderboard de elite por puntos ELO</p>
      </div>

      <div ref={filtersRef} className="relative z-40 overflow-visible rounded-2xl border border-white/35 bg-gradient-to-br from-[#0c2b49] via-[#16456b] to-[#113153] p-3 sm:p-4 mb-4 shadow-xl">
        <div className="absolute inset-0 opacity-35 pointer-events-none bg-[radial-gradient(circle_at_15%_15%,rgba(255,255,255,0.26),transparent_35%),radial-gradient(circle_at_85%_20%,rgba(212,175,55,0.32),transparent_28%),radial-gradient(circle_at_30%_90%,rgba(107,165,219,0.28),transparent_34%)]" />
        <div className="absolute -top-16 -right-14 h-40 w-40 rounded-full bg-[#d4af37]/35 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -left-12 h-48 w-48 rounded-full bg-sky-300/25 blur-3xl pointer-events-none" />

        <div className="relative space-y-3 text-white">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <p className="text-xs font-black text-white/70 uppercase tracking-[0.2em]">Filtros activos</p>
              <h2 className="text-base sm:text-lg font-black text-white">Filtro Inteligente</h2>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/20 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-md">
              <span className="h-2 w-2 rounded-full bg-emerald-300" />
              Mostrando: {modalidad} · {sexoLabel} · {categoria}a
            </div>
          </div>

          <div className="rounded-xl border border-white/25 bg-white/10 backdrop-blur-md p-2.5 shadow-lg shadow-[#0b1a2e]/20 space-y-2.5">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <IconSearch className="h-4 w-4 text-white/65 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  value={searchDraft}
                  onChange={(event) => setSearchDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      setSearchTerm(searchDraft);
                    }
                  }}
                  placeholder="Filtrar por Categoria, Sexo, Modalidad"
                  className="w-full pl-8 pr-3 py-2 rounded-xl border border-white/30 bg-white/14 text-white placeholder:text-white/60 text-sm outline-none focus:border-white/70 focus:bg-white/22"
                />
              </div>
              <button
                type="button"
                onClick={() => setSearchTerm(searchDraft)}
                className="h-9 w-9 rounded-xl border border-white/35 bg-white/16 hover:bg-white/26 transition-colors inline-flex items-center justify-center"
                aria-label="Buscar"
              >
                <IconSearch className="h-4 w-4 text-white" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <FilterDropdown
                id="modalidad"
                label="Modalidad"
                value={modalidad}
                options={MODALIDAD_OPTIONS}
                openFilter={openFilter}
                onToggle={setOpenFilter}
                onSelect={setModalidad}
              />
              <FilterDropdown
                id="sexo"
                label="Sexo"
                value={sexo}
                options={SEXO_OPTIONS}
                openFilter={openFilter}
                onToggle={setOpenFilter}
                onSelect={setSexo}
              />
              <FilterDropdown
                id="categoria"
                label="Categoria"
                value={categoria}
                options={CATEGORIA_OPTIONS}
                openFilter={openFilter}
                onToggle={setOpenFilter}
                onSelect={setCategoria}
              />
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="bg-gradient-to-br from-white via-slate-50 to-[#f8f3e3] rounded-2xl border border-slate-200 p-5 sm:p-6">
          <div className="h-5 w-40 rounded bg-gray-100 animate-pulse mb-4" />
          <div className="space-y-3">
            {[1, 2, 3, 4].map((row) => (
              <div key={row} className="h-14 rounded-xl bg-gray-100 animate-pulse" />
            ))}
          </div>
        </div>
      ) : error ? (
        <div className="bg-red-50 rounded-2xl border border-red-200 p-4 text-red-700 text-sm font-medium">{error}</div>
      ) : jugadores.length === 0 ? (
        <div className="bg-gradient-to-br from-[#f8fbff] to-[#f2ead0] rounded-2xl border border-dashed border-[#d5c086] p-8 text-center text-slate-600">No hay jugadores para esos filtros.</div>
      ) : displayJugadores.length === 0 ? (
        <div className="bg-gradient-to-br from-[#f8fbff] to-[#f2ead0] rounded-2xl border border-dashed border-[#d5c086] p-8 text-center text-slate-600">No hay resultados para la busqueda actual.</div>
      ) : (
        <section className="relative z-10 overflow-hidden rounded-3xl border border-slate-200 shadow-sm">
          {topThree.length > 0 ? (
            <div className="relative bg-[#123a5f] p-4 sm:p-6">
              <div
                className="absolute inset-0 bg-cover bg-center opacity-35"
                style={{
                  backgroundImage: 'url(https://images.unsplash.com/photo-1542144582-1ba00456b5e3?auto=format&fit=crop&w=1600&q=80)',
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-b from-[#0b1a2e]/68 via-[#0f4c81]/55 to-[#0b1a2e]/72" />
              <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#0b1a2e]/40 to-transparent" />

              <div className="relative mb-5 flex items-center justify-between gap-3">
                <h2 className="text-2xl font-black text-white">Podio de Honor</h2>
                <span className="text-xs font-bold text-white/70 uppercase tracking-[0.16em]">Top 3</span>
              </div>

              <div className="relative flex flex-col sm:flex-row sm:items-end sm:justify-center gap-4 sm:gap-5">
                {podiumOrder.map((jugador) => {
                  const podiumConfig = {
                    1: {
                      frame: 'border-[#d4af37] shadow-[0_16px_30px_rgba(212,175,55,0.35)]',
                      bg: 'from-white to-[#fff7dd]',
                      height: 'sm:h-[336px]',
                      avatar: 'h-28 w-28',
                      avatarShape: 'rounded-2xl',
                      order: 'sm:order-2',
                      icon: <IconTrophy className="h-5 w-5 text-[#8f6a16]" />,
                      pointSize: 'text-[2.05rem]',
                      crown: true,
                    },
                    2: {
                      frame: 'border-slate-300 shadow-[0_12px_24px_rgba(148,163,184,0.28)]',
                      bg: 'from-white to-slate-100',
                      height: 'sm:h-[292px]',
                      avatar: 'h-20 w-20',
                      avatarShape: 'rounded-full',
                      order: 'sm:order-1',
                      icon: <IconMedal tone="silver" className="h-5 w-5" />,
                      pointSize: 'text-[2rem]',
                    },
                    3: {
                      frame: 'border-[#b07a4c] shadow-[0_12px_24px_rgba(146,64,14,0.24)]',
                      bg: 'from-white to-[#f6e9df]',
                      height: 'sm:h-[282px]',
                      avatar: 'h-20 w-20',
                      avatarShape: 'rounded-full',
                      order: 'sm:order-3',
                      icon: <IconMedal tone="bronze" className="h-5 w-5" />,
                      pointSize: 'text-[1.95rem]',
                    },
                  }[jugador.pos] || {
                    frame: 'border-slate-200',
                    bg: 'from-white to-slate-50',
                    height: 'sm:h-[280px]',
                    avatar: 'h-20 w-20',
                    avatarShape: 'rounded-full',
                    order: '',
                    icon: renderPosicion(jugador.pos),
                    pointSize: 'text-3xl',
                  };

                  const categoriaTone = CATEGORY_TONES[jugador.categoriaJugador] || CATEGORY_TONES.default;
                  const initials = jugador.nombre.split(' ').map((n) => n[0]).join('').slice(0, 2);
                  const esParejaActual = parejaActualIds.has(String(jugador.id));

                  return (
                    <button
                      key={`podium-${jugador.id}`}
                      type="button"
                      onClick={() => setSelectedPlayerId(jugador.id)}
                      className={`relative w-full sm:max-w-[230px] rounded-2xl border-2 bg-gradient-to-b ${podiumConfig.bg} ${podiumConfig.frame} px-4 pt-7 pb-4 text-center transition-transform hover:-translate-y-1.5 ${podiumConfig.height} ${podiumConfig.order}${esParejaActual ? ' ring-2 ring-cyan-400/70 ring-offset-1' : ''}`}
                    >
                      {podiumConfig.crown ? (
                        <span className="absolute -top-4 left-1/2 -translate-x-1/2 inline-flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-b from-[#f8dd7b] to-[#d4af37] border-2 border-[#d5b24a] shadow-lg shadow-amber-900/30">
                          <IconTrophy className="h-6 w-6 text-[#8f6a16]" />
                        </span>
                      ) : null}

                      <div className="mx-auto mb-2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white shadow border border-slate-200">
                        {podiumConfig.icon}
                      </div>
                      <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-slate-500">#{jugador.pos}</p>
                      <p className={`mt-1 font-black text-slate-900 leading-none ${podiumConfig.pointSize}`}>
                        {jugador.puntos}
                        <span className="text-2xl sm:text-xl font-semibold text-slate-600 ml-1">pts</span>
                      </p>
                      <p className="text-xs text-slate-500 uppercase tracking-[0.12em]">ELO</p>

                      <div className="mt-3 flex justify-center">
                        {jugador.foto_url && !avatarErrors[jugador.id] ? (
                          <div className="relative">
                            <img
                              src={jugador.foto_url}
                              alt={jugador.nombre}
                              className={`${podiumConfig.avatar} ${podiumConfig.avatarShape} object-cover ring-4 ring-white shadow-md`}
                              onError={() => setAvatarErrors((prev) => ({ ...prev, [jugador.id]: true }))}
                            />
                            <span className={`absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-2 border-white ${categoriaTone.dot}`} />
                          </div>
                        ) : (
                          <div className={`relative ${podiumConfig.avatar} ${podiumConfig.avatarShape} bg-gradient-to-br from-blue-500 to-indigo-600 ring-4 ring-white shadow-md flex items-center justify-center`}>
                            <span className="text-white font-bold">{initials}</span>
                            <span className={`absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-2 border-white ${categoriaTone.dot}`} />
                          </div>
                        )}
                      </div>

                      <p className="mt-3 text-[1.08rem] font-black text-slate-900 truncate">{jugador.nombre}</p>
                      {esParejaActual ? (
                        <span className="mt-2 inline-flex items-center gap-1 rounded-full border border-cyan-300 bg-cyan-50 px-2 py-0.5 text-[10px] font-bold text-cyan-700 shadow-sm">
                          <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M13 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM18 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM14 15a4 4 0 0 0-8 0v1h8v-1zM6 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM2 15v-1a4 4 0 0 1 4-4 6.07 6.07 0 0 0-.034.5A6 6 0 0 0 2 15z"/></svg>
                          Pareja Actual
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className={`relative bg-gradient-to-br from-white via-slate-50 to-[#f8f3e3] p-4 sm:p-5 ${topThree.length > 0 ? 'border-t border-slate-200/70' : ''}`}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Tabla de posicion</p>
                <p className="text-sm text-slate-600">{displayJugadores.length} jugadores encontrados</p>
              </div>
              <span className="inline-flex items-center rounded-full bg-[#d4af37] text-[#1f2937] border border-[#d4af37] px-3 py-1 text-xs font-bold shadow-sm shadow-amber-200">
                Ranking en vivo
              </span>
            </div>

            <div className="hidden sm:grid grid-cols-12 gap-3 px-3 text-[11px] font-black uppercase tracking-[0.15em] text-slate-500 mb-2">
              <div className="col-span-2">Puesto</div>
              <div className={modalidad === 'Dobles' ? 'col-span-4' : 'col-span-5'}>{modalidad === 'Dobles' ? 'Jugador / Compañero' : 'Jugador'}</div>
              {modalidad === 'Dobles' && <div className="col-span-1" />}
              <div className="col-span-2">Categoria</div>
              <div className="col-span-2 text-center">ELO</div>
              <div className="col-span-1 text-right">Perfil</div>
            </div>

            <div className="space-y-2.5">
              {displayJugadores.map((j, index) => {
                const categoriaTone = CATEGORY_TONES[j.categoriaJugador] || CATEGORY_TONES.default;
                const isCurrentUser = currentUserId && String(j.id) === currentUserId;
                const initials = j.nombre.split(' ').map((n) => n[0]).join('').slice(0, 2);
                const esParejaActualRow = parejaActualIds.has(String(j.id));

                return (
                  <div
                    key={j.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedPlayerId((prev) => (String(prev) === String(j.id) ? '' : j.id))}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setSelectedPlayerId((prev) => (String(prev) === String(j.id) ? '' : j.id));
                      }
                    }}
                    className={`group rounded-xl border px-3 sm:px-4 py-3 transition-all cursor-pointer backdrop-blur-sm ${index % 2 === 0 ? 'bg-white/90' : 'bg-slate-50/85'} ${j.pos <= 3 ? 'border-[#e2c57a]' : 'border-slate-200'} hover:bg-white hover:shadow-md hover:border-[#0f4c81]/35 ${isCurrentUser ? 'ring-2 ring-[#60a5fa]/65 shadow-[0_0_0_3px_rgba(96,165,250,0.22)] bg-[#eff6ff]/95' : ''}`}
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                      <div className="sm:col-span-2 inline-flex items-center gap-2">
                        <span className="text-2xl font-black text-slate-900 min-w-[48px]">#{j.pos}</span>
                        <TrendIndicator direction={j.trendDirection} />
                      </div>

                      <div className={`${modalidad === 'Dobles' ? 'sm:col-span-5' : 'sm:col-span-5'} flex items-center gap-3 min-w-0`}>
                        {j.foto_url && !avatarErrors[j.id] ? (
                          <div className="relative">
                            <img
                              src={j.foto_url}
                              alt={j.nombre}
                              className="h-11 w-11 rounded-full object-cover ring-2 ring-slate-100"
                              onError={() => setAvatarErrors((prev) => ({ ...prev, [j.id]: true }))}
                            />
                            <span className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white ${categoriaTone.dot}`} />
                          </div>
                        ) : (
                          <div className="relative h-11 w-11 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center ring-2 ring-slate-100">
                            <span className="text-white text-xs font-bold">{initials}</span>
                            <span className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white ${categoriaTone.dot}`} />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-bold text-slate-900 truncate">{j.nombre}</p>
                          <p className="text-xs text-slate-500">{j.torneos} torneos · {j.victorias} victorias</p>
                          {modalidad === 'Dobles' && j.companeroHabitual ? (
                            <span className="mt-0.5 inline-flex items-center gap-1 rounded-full border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-[10px] font-semibold text-cyan-700">
                              <svg className="h-2.5 w-2.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M13 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM18 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM14 15a4 4 0 0 0-8 0v1h8v-1zM6 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM2 15v-1a4 4 0 0 1 4-4 6.07 6.07 0 0 0-.034.5A6 6 0 0 0 2 15z"/></svg>
                              {j.companeroHabitual}
                            </span>
                          ) : null}
                          {esParejaActualRow ? (
                            <span className="mt-0.5 inline-flex items-center gap-1 rounded-full border border-cyan-400 bg-cyan-100 px-2 py-0.5 text-[10px] font-bold text-cyan-800">
                              <svg className="h-2.5 w-2.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M3.172 5.172a4 4 0 0 1 5.656 0L10 6.343l1.172-1.171a4 4 0 1 1 5.656 5.656L10 17.657l-6.828-6.829a4 4 0 0 1 0-5.656z" clipRule="evenodd"/></svg>
                              Pareja Actual
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="sm:col-span-2">
                        <span className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-bold ${categoriaTone.badge}`}>
                          Cat {j.categoriaJugador}
                        </span>
                      </div>

                      <div className="sm:col-span-2 sm:text-center">
                        <p className="text-lg font-black text-[#0f4c81]">{j.puntos}</p>
                        <p className="text-[11px] uppercase tracking-wider text-slate-500">ELO</p>
                      </div>

                      <div className="sm:col-span-1 sm:text-right">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedPlayerId(j.id);
                          }}
                          className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-[#0f4c81] hover:border-[#0f4c81]/40 transition-all opacity-100 md:opacity-0 md:group-hover:opacity-100"
                        >
                          Ver Perfil
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {selectedPlayer ? (
        <div
          className="fixed inset-0 z-30 bg-white/0 backdrop-blur-[2px] flex items-center justify-center p-3 sm:p-5"
          onClick={() => setSelectedPlayerId('')}
        >
          <div
            className="w-full max-w-[700px]"
            onClick={(event) => event.stopPropagation()}
          >
            <RankingPlayerCard
              selectedPlayer={selectedPlayer}
              sexo={sexo}
              modalidad={modalidad}
              categoria={categoria}
              apiUrl={API_URL}
              floating
              onClose={() => setSelectedPlayerId('')}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
