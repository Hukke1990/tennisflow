/* eslint-disable react/prop-types */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { io } from 'socket.io-client';
import CronogramaTorneo from './CronogramaTorneo';
import { IconAlertTriangle } from './icons/UiIcons';
import { resolveProfilePhotoUrl } from '../lib/profilePhoto';
import { useClub } from '../context/ClubContext';
import trophyHero from '../assets/trophy-hero.svg';

const API_URL = '';
const SCORE_CACHE_STORAGE_KEY = 'tennisflow.bracket.scoreCache.v1';
const PERFIL_META_CACHE = new Map();
const REALTIME_EVENTS = [
  'cuadro_actualizado',
  'cronograma_actualizado',
  'partido_programado',
  'partido_reprogramado',
  'partido_actualizado',
  'resultado_cargado',
  'resultado_actualizado',
];
const DEFAULT_POINTS_CONFIG = Object.freeze({
  puntos_ronda_32: 5,
  puntos_ronda_16: 10,
  puntos_ronda_8: 25,
  puntos_ronda_4: 50,
  puntos_ronda_2: 100,
  puntos_campeon: 100,
});
const ROUND_POINTS_FIELD_BY_ORDER = Object.freeze({
  32: 'puntos_ronda_32',
  16: 'puntos_ronda_16',
  8: 'puntos_ronda_8',
  4: 'puntos_ronda_4',
  2: 'puntos_ronda_2',
});

const toSafeNonNegativeInt = (value, fallback = 0) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isInteger(parsed) || parsed < 0) return fallback;
  return parsed;
};

const extractTorneos = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.torneos)) return payload.torneos;
  return [];
};

const normalizePointsConfig = (torneo = {}) => {
  const puntosRonda2 = toSafeNonNegativeInt(
    torneo?.puntos_ronda_2,
    DEFAULT_POINTS_CONFIG.puntos_ronda_2,
  );

  return {
    puntos_ronda_32: toSafeNonNegativeInt(torneo?.puntos_ronda_32, DEFAULT_POINTS_CONFIG.puntos_ronda_32),
    puntos_ronda_16: toSafeNonNegativeInt(torneo?.puntos_ronda_16, DEFAULT_POINTS_CONFIG.puntos_ronda_16),
    puntos_ronda_8: toSafeNonNegativeInt(torneo?.puntos_ronda_8, DEFAULT_POINTS_CONFIG.puntos_ronda_8),
    puntos_ronda_4: toSafeNonNegativeInt(torneo?.puntos_ronda_4, DEFAULT_POINTS_CONFIG.puntos_ronda_4),
    puntos_ronda_2: puntosRonda2,
    puntos_campeon: toSafeNonNegativeInt(torneo?.puntos_campeon, puntosRonda2),
  };
};

const resolveRoundPointsHint = (roundOrder, pointsConfig) => {
  if (!Number.isInteger(roundOrder) || roundOrder <= 0) return null;

  if (roundOrder === 2) {
    return {
      badges: [
        { label: 'Finalista', value: toSafeNonNegativeInt(pointsConfig.puntos_ronda_2, 0), tone: 'sky' },
        { label: 'Campeon', value: toSafeNonNegativeInt(pointsConfig.puntos_campeon, 0), tone: 'gold' },
      ],
    };
  }

  const currentField = ROUND_POINTS_FIELD_BY_ORDER[roundOrder];
  const nextField = ROUND_POINTS_FIELD_BY_ORDER[roundOrder / 2];
  if (!currentField || !nextField) return null;

  const pointsLoseHere = toSafeNonNegativeInt(pointsConfig[currentField], 0);
  const pointsWinAndAdvance = toSafeNonNegativeInt(pointsConfig[nextField], 0);

  return {
    badges: [
      { label: 'Pierde', value: pointsLoseHere, tone: 'slate' },
      { label: 'Gana y avanza', value: pointsWinAndAdvance, tone: 'sky' },
    ],
  };
};

const normalizeSurfaceLabel = (value) => {
  const raw = normalize(value);
  if (!raw) return 'A confirmar';
  if (raw.includes('ladrillo')) return 'Polvo de ladrillo';
  if (raw.includes('cesped') || raw.includes('cÃ©sped')) return 'Cesped';
  if (raw.includes('rapida') || raw.includes('rÃ¡pida') || raw.includes('dura') || raw.includes('hard')) return 'Cancha rapida';
  return String(value || 'A confirmar');
};

const extractPartidos = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.partidos)) return payload.partidos;
  if (Array.isArray(payload?.cuadro)) return payload.cuadro;
  return [];
};

const extractCanchas = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.canchas)) return payload.canchas;
  return [];
};

const readScopedStorage = (storageKey) => {
  if (typeof window === 'undefined') return {};

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
};

const writeScopedStorage = (storageKey, value) => {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(value || {}));
  } catch (_) {
    // Ignore storage quota or serialization errors.
  }
};

const readScoreCacheForTorneo = (torneoId) => {
  if (!torneoId) return {};
  const all = readScopedStorage(SCORE_CACHE_STORAGE_KEY);
  const cached = all?.[String(torneoId)];
  if (!cached || typeof cached !== 'object') return {};

  const cleaned = {};
  Object.entries(cached).forEach(([partidoId, value]) => {
    const id = String(partidoId || '').trim();
    const score = String(value || '').trim();
    if (!id || !score) return;
    cleaned[id] = score;
  });

  return cleaned;
};

const writeScoreCacheForTorneo = (torneoId, scoreMap) => {
  if (!torneoId) return;

  const all = readScopedStorage(SCORE_CACHE_STORAGE_KEY);
  const cleaned = {};

  Object.entries(scoreMap || {}).forEach(([partidoId, value]) => {
    const id = String(partidoId || '').trim();
    const score = String(value || '').trim();
    if (!id || !score) return;
    cleaned[id] = score;
  });

  if (Object.keys(cleaned).length === 0) {
    if (Object.prototype.hasOwnProperty.call(all, String(torneoId))) {
      const next = { ...all };
      delete next[String(torneoId)];
      writeScopedStorage(SCORE_CACHE_STORAGE_KEY, next);
    }
    return;
  }

  writeScopedStorage(SCORE_CACHE_STORAGE_KEY, {
    ...all,
    [String(torneoId)]: cleaned,
  });
};

const normalize = (value) => String(value || '').toLowerCase();

const getFirstNonEmpty = (values = []) => {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const asString = String(value).trim();
    if (asString) return asString;
  }
  return '';
};

const getNombreCompletoJugador = (jugador) => {
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

  return nombreCompleto || [nombre, apellido].filter(Boolean).join(' ').trim() || '';
};

const getJugadorId = (partido, side) => {
  const jugador = side === 1 ? partido?.jugador1 : partido?.jugador2;
  const idFields = side === 1
    ? ['jugador1_id', 'player1_id', 'participante1_id', 'competidor1_id', 'jugador_1_id', 'id_jugador_1']
    : ['jugador2_id', 'player2_id', 'participante2_id', 'competidor2_id', 'jugador_2_id', 'id_jugador_2'];

  return getFirstNonEmpty([
    jugador?.id,
    ...idFields.map((field) => partido?.[field]),
  ]);
};

const getJugadorNombreDirecto = (partido, side) => {
  const jugador = side === 1 ? partido?.jugador1 : partido?.jugador2;
  const jugadorPareja = side === 1 ? partido?.jugador1_pareja : partido?.jugador2_pareja;
  const nombreObjeto = getNombreCompletoJugador(jugador);
  const nombrePareja = getNombreCompletoJugador(jugadorPareja);

  const nameFields = side === 1
    ? ['jugador1_nombre', 'nombre_jugador_1', 'player1_name', 'jugador_1_nombre']
    : ['jugador2_nombre', 'nombre_jugador_2', 'player2_name', 'jugador_2_nombre'];

  const nombreDesdePayload = getFirstNonEmpty(nameFields.map((field) => partido?.[field]));
  if (nombreDesdePayload) return nombreDesdePayload;

  if (nombreObjeto && nombrePareja) {
    return `${nombreObjeto} / ${nombrePareja}`;
  }

  if (nombreObjeto) return nombreObjeto;
  if (nombrePareja) return nombrePareja;

  return '';
};

const getJugadorRankingDirecto = (partido, side) => {
  const jugador = side === 1 ? partido?.jugador1 : partido?.jugador2;
  const rankingFields = side === 1
    ? ['jugador1_ranking_posicion', 'ranking_posicion_jugador_1', 'player1_ranking_position', 'jugador1_ranking', 'ranking1_posicion', 'ranking1']
    : ['jugador2_ranking_posicion', 'ranking_posicion_jugador_2', 'player2_ranking_position', 'jugador2_ranking', 'ranking2_posicion', 'ranking2'];

  return getFirstNonEmpty([
    jugador?.posicion_ranking,
    jugador?.ranking_posicion,
    jugador?.position,
    jugador?.ranking_actual,
    jugador?.ranking_position,
    ...rankingFields.map((field) => partido?.[field]),
  ]);
};

const getOrigenPartidoId = (partido, side) => {
  const originFields = side === 1
    ? ['jugador1_origen_partido_id', 'partido_anterior_1_id', 'origen_partido_1_id', 'previous_match_1_id']
    : ['jugador2_origen_partido_id', 'partido_anterior_2_id', 'origen_partido_2_id', 'previous_match_2_id'];

  return getFirstNonEmpty(originFields.map((field) => partido?.[field]));
};

const hasMeaningfulLiveEvidence = (partido) => {
  const rawScore = String(partido?.marcador_en_vivo || partido?.score || partido?.resultado || partido?.marcador || '').trim().toUpperCase();
  const defaultScores = new Set(['', '0-0', '-/-', 'S0-0 G0-0 P0-0', 'S0-0 G0-0 TB0-0']);

  if (String(partido?.inicio_real || '').trim()) return true;
  if (String(partido?.ultima_actualizacion || '').trim()) return true;
  if (!defaultScores.has(rawScore)) return true;

  return false;
};

const isConflictAvailability = (partido) => {
  const notes = normalize(partido?.notas || partido?.nota || partido?.observaciones);
  return notes.includes('conflicto') && (notes.includes('disponibilidad') || notes.includes('horario'));
};

const getEstadoPartido = (partido) => {
  const estado = normalize(partido?.estado);

  if (estado.includes('final') || estado.includes('termin') || estado.includes('complet') || partido?.ganador_id) {
    return { key: 'finalizado', label: 'Finalizado', badge: 'bg-white/8 text-white/55 border-white/15' };
  }

  if ((estado.includes('juego') || estado.includes('curso') || estado.includes('live')) && hasMeaningfulLiveEvidence(partido)) {
    return { key: 'en_juego', label: 'En Vivo', badge: 'bg-[#a6ce39]/15 text-[#a6ce39] border-[#a6ce39]/30' };
  }

  return { key: 'programado', label: 'Programado', badge: 'bg-sky-500/10 text-sky-300 border-sky-400/25' };
};

const getJugadorNombre = (partido, side) => {
  return getJugadorNombreDirecto(partido, side) || 'Por definir';
};

const formatRankingLabel = (rankingValue) => {
  const safe = String(rankingValue || '').trim();
  if (!safe) return '';
  return `#${safe}`;
};

const SEED_ORDINALS = ['', '1er', '2do', '3er', '4to'];
const seedLabel = (seed) => (seed >= 1 && seed <= 4 ? SEED_ORDINALS[seed] : `#${seed}`);

const toRankingNumber = (value) => {
  const safe = String(value || '').trim();
  if (!safe) return Number.POSITIVE_INFINITY;

  const match = safe.match(/\d+/);
  if (!match) return Number.POSITIVE_INFINITY;

  const parsed = Number.parseInt(match[0], 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return Number.POSITIVE_INFINITY;
  return parsed;
};

const isTechnicalLiveScore = (value) => {
  const text = String(value || '').trim().toUpperCase();
  if (!text) return false;

  const hasSet = /(^|\s)S\d+-\d+/.test(text);
  const hasGame = /(^|\s)G\d+-\d+/.test(text);
  const hasPointOrTb = /(^|\s)(P|TB)\d+-\d+/.test(text);
  return hasSet && hasGame && hasPointOrTb;
};

const sanitizeScoreText = (value) => {
  const text = String(value || '').trim();
  if (!text) return '';

  const normalized = text.toUpperCase();
  if (normalized === '0-0' || normalized === '-/-') return '';
  if (isTechnicalLiveScore(text)) return '';
  return text;
};

const scoreFromSets = (resultado) => {
  if (!resultado || typeof resultado !== 'object') return '';

  const sets = Array.isArray(resultado.sets) ? resultado.sets : [];
  const chunks = sets
    .map((setItem) => {
      if (Array.isArray(setItem) && setItem.length >= 2) {
        return `${setItem[0]}-${setItem[1]}`;
      }

      if (setItem && typeof setItem === 'object') {
        const left = setItem.j1 ?? setItem.jugador1 ?? setItem.player1 ?? setItem.local ?? setItem.a;
        const right = setItem.j2 ?? setItem.jugador2 ?? setItem.player2 ?? setItem.visitante ?? setItem.b;
        if (left !== undefined && right !== undefined) {
          return `${left}-${right}`;
        }
      }

      return '';
    })
    .filter(Boolean);

  return chunks.join(' / ');
};

const resolveScoreValue = (rawValue) => {
  if (rawValue === null || rawValue === undefined) return '';

  if (typeof rawValue === 'string' || typeof rawValue === 'number') {
    return sanitizeScoreText(rawValue);
  }

  if (typeof rawValue === 'object') {
    const fromSets = scoreFromSets(rawValue);
    if (fromSets) return sanitizeScoreText(fromSets);

    const nestedCandidate = rawValue.score
      ?? rawValue.resultado
      ?? rawValue.marcador_en_vivo
      ?? rawValue.marcador
      ?? '';

    if (nestedCandidate && nestedCandidate !== rawValue) {
      return resolveScoreValue(nestedCandidate);
    }
  }

  return '';
};

const getScore = (partido) => {
  const candidates = [
    partido?.score,
    partido?.resultado,
    partido?.marcador_en_vivo,
    partido?.marcador,
  ];

  for (const candidate of candidates) {
    const resolved = resolveScoreValue(candidate);
    if (resolved) return resolved;
  }

  return '';
};

const getCategoriaRama = (partido) => {
  const categoria = partido?.categoria || partido?.torneo_categoria || partido?.categoria_nombre || '-';
  const rama = partido?.rama || partido?.sexo || '-';
  return `${categoria} / ${rama}`;
};

const formatSlot = (partido) => {
  const timeLabel = partido?.fecha_hora
    ? format(new Date(partido.fecha_hora), "EEE d MMM, HH:mm", { locale: es })
    : 'Sin hora asignada';
  const canchaLabel = partido?.cancha?.nombre || partido?.cancha_nombre || 'Sin cancha asignada';
  return { timeLabel, canchaLabel };
};

const sortPartidosByOrder = (matches) => {
  return [...matches].sort((a, b) => {
    const primary = Number(a?.orden_en_ronda || a?.match_index || a?.id || 0) - Number(b?.orden_en_ronda || b?.match_index || b?.id || 0);
    if (primary !== 0) return primary;
    return Number(a?.id || 0) - Number(b?.id || 0);
  });
};

const shouldContinueFallback = (error) => {
  const status = Number(error?.response?.status || 0);
  if (!status) return true;

  // Keep trying only when endpoint/path is unsupported; stop on semantic/business errors.
  return status === 404 || status === 405 || status === 501;
};

const runFallbackRequest = async (requestFns) => {
  let lastError = null;

  for (const requestFn of requestFns) {
    try {
      return await requestFn();
    } catch (error) {
      lastError = error;
      if (!shouldContinueFallback(error)) {
        break;
      }
    }
  }

  throw lastError || new Error('No se pudo completar la solicitud.');
};

const getPartidoIdCandidates = (partidoOrId) => {
  const rawValues = typeof partidoOrId === 'object' && partidoOrId !== null
    ? [
      partidoOrId?.id,
      partidoOrId?.partido_id,
      partidoOrId?.partidoId,
      partidoOrId?.match_id,
      partidoOrId?.matchId,
      partidoOrId?.id_partido,
    ]
    : [partidoOrId];

  const unique = [];
  rawValues.forEach((value) => {
    if (value === null || value === undefined || value === '') return;
    const asString = String(value).trim();
    if (!asString) return;
    if (!unique.includes(asString)) unique.push(asString);
  });

  return unique;
};

const buildPartidoRequestFallbacks = ({ partidoRef, torneoId, payload, suffixes = [''] }) => {
  const ids = getPartidoIdCandidates(partidoRef);
  const verbs = ['put', 'patch'];
  const requests = [];
  const dedupe = new Set();

  ids.forEach((id) => {
    const encodedId = encodeURIComponent(id);

    verbs.forEach((verb) => {
      suffixes.forEach((suffix) => {
        const basePath = suffix
          ? `${API_URL}/api/partidos/${encodedId}/${suffix}`
          : `${API_URL}/api/partidos/${encodedId}`;
        const baseKey = `${verb}:${basePath}`;
        if (!dedupe.has(baseKey)) {
          dedupe.add(baseKey);
          requests.push(() => axios[verb](basePath, payload));
        }

        if (torneoId) {
          const torneoPath = suffix
            ? `${API_URL}/api/torneos/${torneoId}/partidos/${encodedId}/${suffix}`
            : `${API_URL}/api/torneos/${torneoId}/partidos/${encodedId}`;
          const torneoKey = `${verb}:${torneoPath}`;
          if (!dedupe.has(torneoKey)) {
            dedupe.add(torneoKey);
            requests.push(() => axios[verb](torneoPath, payload));
          }
        }
      });
    });
  });

  return requests;
};

const payloadMatchesTournament = (payload, torneoId) => {
  if (!payload || !torneoId) return true;

  const directIds = [
    payload?.torneo_id,
    payload?.torneoId,
    payload?.torneo?.id,
    payload?.partido?.torneo_id,
    payload?.partido?.torneoId,
  ].filter(Boolean);

  if (directIds.length === 0) return true;
  return directIds.some((id) => String(id) === String(torneoId));
};

export default function TournamentBracket({ torneoId, adminMode = false }) {
  const { clubId: contextClubId } = useClub();
  const [partidos, setPartidos] = useState([]);
  const [canchas, setCanchas] = useState([]);
  const [torneoEstado, setTorneoEstado] = useState('');
  const [torneoClubId, setTorneoClubId] = useState(null);
  const [torneoSexo, setTorneoSexo] = useState(null);
  const [torneoModalidad, setTorneoModalidad] = useState(null);
  const [torneoCategoria, setTorneoCategoria] = useState(null);
  const [perfilMetaById, setPerfilMetaById] = useState({});
  const [rankingPosById, setRankingPosById] = useState({});
  const [scoreOverrideByPartido, setScoreOverrideByPartido] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeView, setActiveView] = useState('bracket');
  const [mutationBusy, setMutationBusy] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [hoveredPlayerId, setHoveredPlayerId] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);
  const [cachedScoreByPartido, setCachedScoreByPartido] = useState({});
  const [pointsConfig, setPointsConfig] = useState(DEFAULT_POINTS_CONFIG);
  const [resultModal, setResultModal] = useState({
    open: false,
    partido: null,
    ganadorId: '',
    score: '',
  });
  const cachedScoreRef = useRef({});
  const bracketContainerRef = useRef(null);
  const dragRef = useRef({ active: false, startX: 0, startY: 0, scrollX: 0, scrollY: 0 });

  useEffect(() => {
    cachedScoreRef.current = cachedScoreByPartido;
  }, [cachedScoreByPartido]);

  useEffect(() => {
    if (!torneoId) {
      setCachedScoreByPartido({});
      return;
    }

    setCachedScoreByPartido(readScoreCacheForTorneo(torneoId));
  }, [torneoId]);

  useEffect(() => {
    if (!torneoId) return;
    writeScoreCacheForTorneo(torneoId, cachedScoreByPartido);
  }, [torneoId, cachedScoreByPartido]);

  useEffect(() => {
    if (!torneoId) {
      setPointsConfig(DEFAULT_POINTS_CONFIG);
      setTorneoEstado('');
      setTorneoClubId(null);
      setTorneoSexo(null);
      setTorneoModalidad(null);
      setTorneoCategoria(null);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const [adminRes, torneosRes] = await Promise.allSettled([
          axios.get(`${API_URL}/api/torneos/admin`),
          axios.get(`${API_URL}/api/torneos`, { params: { club_id: contextClubId } }),
        ]);

        const torneos = [
          ...(adminRes.status === 'fulfilled' ? extractTorneos(adminRes.value?.data) : []),
          ...(torneosRes.status === 'fulfilled' ? extractTorneos(torneosRes.value?.data) : []),
        ];

        const torneo = torneos.find((item) => String(item?.id || '') === String(torneoId || ''));
        if (cancelled) return;

        const parseTorneoCategoria = (t) => {
          const raw = t?.categoria ?? t?.categoria_id ?? t?.categoria_singles;
          const num = Number.parseInt(String(raw ?? ''), 10);
          return Number.isFinite(num) && num >= 1 && num <= 5 ? num : null;
        };

        if (!torneo) {
          setPointsConfig(DEFAULT_POINTS_CONFIG);
          setTorneoEstado('');
          setTorneoClubId(String(contextClubId || '').trim() || null);
          setTorneoSexo(null);
          setTorneoModalidad(null);
          setTorneoCategoria(null);
          return;
        }

        setPointsConfig(normalizePointsConfig(torneo));
        setTorneoEstado(String(torneo?.estado || ''));
        setTorneoClubId(String(torneo?.club_id || contextClubId || '').trim() || null);
        const rawSexo = String(torneo?.rama || torneo?.sexo || '').trim();
        setTorneoSexo(['Masculino', 'Femenino'].includes(rawSexo) ? rawSexo : null);
        const rawMod = String(torneo?.modalidad || '').trim();
        setTorneoModalidad(['Singles', 'Dobles'].includes(rawMod) ? rawMod : null);
        setTorneoCategoria(parseTorneoCategoria(torneo));
      } catch (_) {
        if (!cancelled) {
          setPointsConfig(DEFAULT_POINTS_CONFIG);
          setTorneoEstado('');
          setTorneoClubId(String(contextClubId || '').trim() || null);
          setTorneoSexo(null);
          setTorneoModalidad(null);
          setTorneoCategoria(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [torneoId, contextClubId]);

  const cacheScore = useCallback((partidoOrId, scoreValue) => {
    const partidoId = String(
      typeof partidoOrId === 'object' && partidoOrId !== null
        ? partidoOrId?.id
        : partidoOrId
    || '').trim();
    const score = String(scoreValue || '').trim();
    if (!partidoId || !score) return;

    setCachedScoreByPartido((prev) => {
      if (prev[partidoId] === score) return prev;
      return {
        ...prev,
        [partidoId]: score,
      };
    });
  }, []);

  const getPerfilMeta = useCallback((id) => {
    const key = String(id || '').trim();
    if (!key) return null;
    return perfilMetaById[key] || PERFIL_META_CACHE.get(key) || null;
  }, [perfilMetaById]);

  const getNombrePerfil = useCallback((id) => {
    return getPerfilMeta(id)?.name || '';
  }, [getPerfilMeta]);

  const getRankingPerfil = useCallback((id) => {
    return getPerfilMeta(id)?.ranking || '';
  }, [getPerfilMeta]);

  const getFotoPerfil = useCallback((id) => {
    return getPerfilMeta(id)?.photo || '';
  }, [getPerfilMeta]);

  const getLocalidadPerfil = useCallback((id) => {
    return getPerfilMeta(id)?.localidad || '';
  }, [getPerfilMeta]);

  const getRankingPos = useCallback((id) => {
    const key = String(id || '').trim();
    if (!key) return '';
    return String(rankingPosById[key] || '').trim();
  }, [rankingPosById]);

  useEffect(() => {
    if (!torneoId || !torneoClubId) {
      setRankingPosById({});
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const toElo = (jugador) => Number(
          jugador?.ranking_elo_singles
          ?? jugador?.ranking_elo
          ?? jugador?.elo
          ?? jugador?.ranking_puntos_singles
          ?? jugador?.ranking_puntos
          ?? 0
        );

        const baseParams = {
          club_id: torneoClubId,
          ...(torneoSexo ? { sexo: torneoSexo } : {}),
          ...(torneoModalidad ? { modalidad: torneoModalidad } : {}),
        };

        let rows = [];

        if (torneoCategoria) {
          // CategorÃ­a conocida: una sola llamada
          const { data } = await axios.get(`${API_URL}/api/rankings`, {
            params: { ...baseParams, categoria: torneoCategoria },
          });
          rows = Array.isArray(data) ? data : Array.isArray(data?.jugadores) ? data.jugadores : [];
        } else {
          // CategorÃ­a desconocida: pedir todas en paralelo y unir
          const results = await Promise.allSettled(
            [1, 2, 3, 4, 5].map((cat) =>
              axios.get(`${API_URL}/api/rankings`, { params: { ...baseParams, categoria: cat } })
            )
          );
          const seen = new Set();
          results.forEach((r) => {
            if (r.status !== 'fulfilled') return;
            const d = r.value?.data;
            const list = Array.isArray(d) ? d : Array.isArray(d?.jugadores) ? d.jugadores : [];
            list.forEach((j) => {
              const id = getFirstNonEmpty([j?.id, j?.jugador_id]);
              if (!id || seen.has(id)) return;
              seen.add(id);
              rows.push(j);
            });
          });
        }

        const sorted = [...rows].sort((a, b) => toElo(b) - toElo(a));
        const map = {};
        sorted.forEach((jugador, index) => {
          const id = getFirstNonEmpty([jugador?.id, jugador?.jugador_id]);
          if (!id) return;
          map[String(id)] = String(index + 1);
        });

        if (!cancelled) setRankingPosById(map);
      } catch (_) {
        if (!cancelled) setRankingPosById({});
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [torneoId, torneoClubId, torneoSexo, torneoModalidad, torneoCategoria]);

  useEffect(() => {
    const ids = new Set();
    partidos.forEach((partido) => {
      [
        getJugadorId(partido, 1),
        getJugadorId(partido, 2),
        partido?.ganador_id,
      ].forEach((id) => {
        const safeId = String(id || '').trim();
        if (safeId) ids.add(safeId);
      });
    });

    const missingIds = Array.from(ids).filter((id) => !PERFIL_META_CACHE.has(id) && !perfilMetaById[id]);
    if (missingIds.length === 0) return;

    let cancelled = false;
    (async () => {
      const resolvedPairs = await Promise.all(
        missingIds.map(async (id) => {
          try {
            const { data } = await axios.get(`${API_URL}/api/perfil/${encodeURIComponent(id)}`);
            const resolvedPhoto = await resolveProfilePhotoUrl(data?.foto_url);
            const meta = {
              name: getNombreCompletoJugador(data),
              ranking: getFirstNonEmpty([
                data?.posicion_ranking,
                data?.ranking_posicion,
                data?.position,
                data?.ranking_actual,
                data?.ranking_position,
              ]),
              photo: String(resolvedPhoto || data?.foto_url || '').trim(),
              localidad: getFirstNonEmpty([
                data?.pais,
                data?.nacionalidad,
                data?.localidad,
                data?.ciudad,
              ]),
            };
            PERFIL_META_CACHE.set(id, meta);
            return [id, meta];
          } catch (_) {
            const emptyMeta = { name: '', ranking: '', photo: '', localidad: '' };
            PERFIL_META_CACHE.set(id, emptyMeta);
            return [id, emptyMeta];
          }
        })
      );

      if (cancelled) return;

      setPerfilMetaById((prev) => {
        const next = { ...prev };
        let changed = false;

        resolvedPairs.forEach(([id, meta]) => {
          if (!id || !meta) return;
          const current = next[id] || { name: '', ranking: '', photo: '', localidad: '' };
          const merged = {
            name: current.name || meta.name || '',
            ranking: current.ranking || meta.ranking || '',
            photo: current.photo || meta.photo || '',
            localidad: current.localidad || meta.localidad || '',
          };
          if (
            merged.name === current.name
            && merged.ranking === current.ranking
            && merged.photo === current.photo
            && merged.localidad === current.localidad
          ) return;
          next[id] = merged;
          changed = true;
        });

        return changed ? next : prev;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [partidos, perfilMetaById]);

  const jugadoresPorPartido = useMemo(() => {
    const byRound = {};
    partidos.forEach((partido) => {
      const roundOrder = Number(partido?.ronda_orden || 0);
      if (!Number.isFinite(roundOrder) || roundOrder <= 0) return;
      if (!byRound[roundOrder]) byRound[roundOrder] = [];
      byRound[roundOrder].push(partido);
    });

    const roundOrders = Object.keys(byRound)
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0)
      .sort((a, b) => b - a);

    const displayByPartidoId = {};
    const winnerDisplayByMatchId = {};

    const resolveWinnerFromMatch = (sourceMatchId) => {
      const safeId = String(sourceMatchId || '').trim();
      if (!safeId) return null;
      return winnerDisplayByMatchId[safeId] || null;
    };

    const resolveSide = (partido, side) => {
      const directId = getJugadorId(partido, side);
      const directName = getJugadorNombreDirecto(partido, side) || getNombrePerfil(directId);
      const directRanking = getJugadorRankingDirecto(partido, side) || getRankingPerfil(directId);
      const rankingPos = getRankingPos(String(directId || '').trim());

      if (String(directId || '').trim() || String(directName || '').trim()) {
        return {
          id: String(directId || '').trim(),
          name: directName || 'Por definir',
          // Priorizar posiciÃ³n de ranking (#1, #2â€¦) sobre ELO crudo
          ranking: String(rankingPos || directRanking || '').trim(),
        };
      }

      const originMatchId = getOrigenPartidoId(partido, side);

      if (originMatchId) {
        const originWinner = resolveWinnerFromMatch(originMatchId);
        if (originWinner?.id) {
          return {
            id: originWinner.id,
            name: originWinner.name || 'Por definir',
            ranking: originWinner.ranking || '',
          };
        }

        return {
          id: '',
          name: 'Por definir',
          ranking: '',
        };
      }
      const rankingFromList = getRankingPos(directId);

      return {
        id: String(directId || '').trim(),
        name: directName || 'Por definir',
        ranking: String(directRanking || rankingFromList || '').trim(),
      };
    };

    roundOrders.forEach((roundOrder) => {
      const roundMatches = sortPartidosByOrder(byRound[roundOrder] || []);

      roundMatches.forEach((partido) => {
        const partidoId = String(partido?.id || '').trim();
        if (!partidoId) return;

        const side1 = resolveSide(partido, 1);
        const side2 = resolveSide(partido, 2);

        displayByPartidoId[partidoId] = {
          j1Id: side1.id,
          j2Id: side2.id,
          j1Name: side1.name,
          j2Name: side2.name,
          j1Ranking: side1.ranking,
          j2Ranking: side2.ranking,
        };

        const winnerId = String(partido?.ganador_id || '').trim();
        if (winnerId) {
          const winnerDisplay = winnerId === String(side1.id || '').trim()
            ? { ...side1 }
            : winnerId === String(side2.id || '').trim()
              ? { ...side2 }
              : {
                id: winnerId,
                name: getNombrePerfil(winnerId) || 'Por definir',
                ranking: getRankingPerfil(winnerId) || getRankingPos(winnerId),
              };

          winnerDisplayByMatchId[partidoId] = winnerDisplay;
        }
      });
    });

    return displayByPartidoId;
  }, [partidos, getNombrePerfil, getRankingPerfil, getRankingPos]);

  const seedByJugadorId = useMemo(() => {
    if (!Array.isArray(partidos) || partidos.length === 0) return {};

    const roundOrders = partidos
      .map((partido) => Number(partido?.ronda_orden || 0))
      .filter((value) => Number.isFinite(value) && value > 0);

    if (roundOrders.length === 0) return {};

    const firstRoundOrder = Math.max(...roundOrders);
    const firstRoundMatches = partidos.filter(
      (partido) => Number(partido?.ronda_orden || 0) === firstRoundOrder
    );

    const candidatesById = new Map();

    firstRoundMatches.forEach((partido) => {
      const partidoId = String(partido?.id || '').trim();
      const resolved = jugadoresPorPartido[partidoId] || {};

      const sides = [
        {
          id: resolved.j1Id || getJugadorId(partido, 1),
          name: resolved.j1Name || getJugadorNombre(partido, 1),
          ranking: getRankingPos(resolved.j1Id || getJugadorId(partido, 1))
            || resolved.j1Ranking
            || getJugadorRankingDirecto(partido, 1)
            || getRankingPerfil(resolved.j1Id || getJugadorId(partido, 1)),
        },
        {
          id: resolved.j2Id || getJugadorId(partido, 2),
          name: resolved.j2Name || getJugadorNombre(partido, 2),
          ranking: getRankingPos(resolved.j2Id || getJugadorId(partido, 2))
            || resolved.j2Ranking
            || getJugadorRankingDirecto(partido, 2)
            || getRankingPerfil(resolved.j2Id || getJugadorId(partido, 2)),
        },
      ];

      sides.forEach((side) => {
        const id = String(side?.id || '').trim();
        if (!id) return;
        if (candidatesById.has(id)) return;

        candidatesById.set(id, {
          id,
          name: String(side?.name || '').trim(),
          ranking: String(side?.ranking || '').trim(),
        });
      });
    });

    const sorted = Array.from(candidatesById.values())
      .filter((candidate) => Number.isFinite(toRankingNumber(candidate.ranking)))
      .sort((a, b) => {
        const rankingDiff = toRankingNumber(a.ranking) - toRankingNumber(b.ranking);
        if (rankingDiff !== 0) return rankingDiff;
        return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
      })
      .slice(0, 4);

    const seeds = {};
    sorted.forEach((candidate, index) => {
      seeds[candidate.id] = index + 1;
    });

    return seeds;
  }, [partidos, jugadoresPorPartido, getRankingPerfil, getRankingPos]);

  const getScoreDisplay = useCallback((partido) => {
    const partidoId = String(partido?.id || '').trim();
    return getScore(partido)
      || scoreOverrideByPartido[partidoId]
      || cachedScoreByPartido[partidoId]
      || '';
  }, [scoreOverrideByPartido, cachedScoreByPartido]);

  const fetchCuadro = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      const { data } = await axios.get(`${API_URL}/api/torneos/${torneoId}/cuadro`);
      const loaded = extractPartidos(data);
      const cached = cachedScoreRef.current || {};

      const merged = loaded.map((partido) => {
        const partidoId = String(partido?.id || '').trim();
        if (!partidoId) return partido;

        const backendScore = String(getScore(partido) || '').trim();
        if (backendScore) return partido;

        const cachedScore = String(cached[partidoId] || '').trim();
        if (!cachedScore) return partido;

        return {
          ...partido,
          marcador_en_vivo: partido?.marcador_en_vivo || cachedScore,
          marcador: partido?.marcador || cachedScore,
          score: partido?.score || cachedScore,
          resultado: partido?.resultado || cachedScore,
        };
      });

      setPartidos(merged);

      const backendScores = {};
      loaded.forEach((partido) => {
        const partidoId = String(partido?.id || '').trim();
        const backendScore = String(getScore(partido) || '').trim();
        if (!partidoId || !backendScore) return;
        backendScores[partidoId] = backendScore;
      });

      if (Object.keys(backendScores).length > 0) {
        setCachedScoreByPartido((prev) => {
          const next = { ...prev };
          let changed = false;

          Object.entries(backendScores).forEach(([partidoId, score]) => {
            if (next[partidoId] === score) return;
            next[partidoId] = score;
            changed = true;
          });

          return changed ? next : prev;
        });
      }
    } catch (err) {
      if (silent) return;

      const status = err?.response?.status;
      const backendMsg = err?.response?.data?.error;

      if (status === 404) {
        setError('Todavia no existe cuadro para este torneo. Genera el sorteo primero.');
      } else if (status === 500) {
        setError(backendMsg || 'Error interno del backend al obtener el cuadro (500).');
      } else {
        setError(backendMsg || 'No se pudo cargar el cuadro en este momento.');
      }

      setPartidos([]);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [torneoId]);

  const fetchCanchasTorneo = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_URL}/api/torneos/${torneoId}/canchas`);
      const extracted = extractCanchas(data);
      if (extracted.length > 0) {
        setCanchas(extracted);
        return;
      }
    } catch (_) {
      // Fallback below.
    }

    try {
      const { data } = await axios.get(`${API_URL}/api/canchas`);
      setCanchas(extractCanchas(data));
    } catch (_) {
      setCanchas([]);
    }
  }, [torneoId]);

  useEffect(() => {
    if (!torneoId) return;
    fetchCuadro();
    fetchCanchasTorneo();
  }, [torneoId, fetchCuadro, fetchCanchasTorneo]);

  useEffect(() => {
    if (!torneoId) return;

    const refreshSilent = () => {
      fetchCuadro({ silent: true });
      fetchCanchasTorneo();
    };

    const isLocalhost = typeof window !== 'undefined'
      && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

    let socket = null;
    let eventHandlers = [];
    if (isLocalhost) {
      socket = io(API_URL);
      eventHandlers = REALTIME_EVENTS.map((eventName) => {
        const handler = (payload) => {
          if (!payloadMatchesTournament(payload, torneoId)) return;
          refreshSilent();
        };
        socket.on(eventName, handler);
        return { eventName, handler };
      });
    }

    const intervalId = setInterval(refreshSilent, 8000);

    return () => {
      clearInterval(intervalId);
      if (socket) {
        eventHandlers.forEach(({ eventName, handler }) => socket.off(eventName, handler));
        socket.disconnect();
      }
    };
  }, [torneoId, fetchCuadro, fetchCanchasTorneo]);

  const rondas = useMemo(() => {
    return partidos.reduce((acc, partido) => {
      const key = partido?.ronda_orden || partido?.ronda || 'sin-ronda';
      if (!acc[key]) acc[key] = [];
      acc[key].push(partido);
      return acc;
    }, {});
  }, [partidos]);

  const bracketOrder = useMemo(
    () => Object.keys(rondas).sort((a, b) => Number(b) - Number(a)),
    [rondas]
  );

  const nonFinalRounds = useMemo(() => bracketOrder.slice(0, -1), [bracketOrder]);
  const finalRoundKey = useMemo(() => bracketOrder[bracketOrder.length - 1] ?? null, [bracketOrder]);

  const BRACKET_CELL_H = 240;
  const firstRoundTopCount = useMemo(() => {
    if (nonFinalRounds.length === 0) return 1;
    const matches = sortPartidosByOrder(rondas[nonFinalRounds[0]] || []);
    return Math.max(1, Math.ceil(matches.length / 2));
  }, [nonFinalRounds, rondas]);
  const symColHeight = firstRoundTopCount * BRACKET_CELL_H;

  const finalPartido = useMemo(() => {
    if (!Array.isArray(partidos) || partidos.length === 0) return null;

    const rounds = partidos
      .map((partido) => Number(partido?.ronda_orden || 0))
      .filter((value) => Number.isFinite(value) && value > 0);

    if (rounds.length === 0) return null;
    const finalRoundOrder = Math.min(...rounds);
    const finalMatches = sortPartidosByOrder(
      partidos.filter((partido) => Number(partido?.ronda_orden || 0) === finalRoundOrder)
    );

    return finalMatches[0] || null;
  }, [partidos]);

  const finalWinnerId = useMemo(
    () => String(finalPartido?.ganador_id || '').trim(),
    [finalPartido]
  );

  const finalWinnerDisplayName = useMemo(() => {
    if (!finalPartido) return '';

    const ganadorId = finalWinnerId;
    if (!ganadorId) return '';

    const resolved = jugadoresPorPartido[String(finalPartido?.id || '')] || {};
    const fullNameFromPerfil = String(getNombrePerfil(ganadorId) || '').trim();

    let resolvedWinnerName = '';
    if (ganadorId === String(resolved?.j1Id || '').trim()) {
      resolvedWinnerName = String(resolved?.j1Name || '').trim();
    }
    if (!resolvedWinnerName && ganadorId === String(resolved?.j2Id || '').trim()) {
      resolvedWinnerName = String(resolved?.j2Name || '').trim();
    }

    // Prefer explicit full name from profile when available.
    if (fullNameFromPerfil.includes(' ')) return fullNameFromPerfil;
    if (resolvedWinnerName.includes(' ')) return resolvedWinnerName;

    return fullNameFromPerfil || resolvedWinnerName || 'Por definir';
  }, [finalPartido, finalWinnerId, jugadoresPorPartido, getNombrePerfil]);

  const torneoFinalizado = useMemo(() => {
    const estado = normalize(torneoEstado);
    return estado.includes('final');
  }, [torneoEstado]);

  const finalizacionFechaLabel = useMemo(() => {
    if (!torneoFinalizado) return '';

    const rawDate =
      finalPartido?.ultima_actualizacion
      || finalPartido?.updated_at
      || finalPartido?.fecha_hora
      || null;

    const parsed = rawDate ? new Date(rawDate) : new Date();
    if (!(parsed instanceof Date) || Number.isNaN(parsed.getTime())) return '';

    try {
      return format(parsed, 'dd/MM/yyyy', { locale: es });
    } catch (_) {
      return '';
    }
  }, [torneoFinalizado, finalPartido]);

  const hallOfFameMode = activeView === 'bracket' && torneoFinalizado;

  const finalWinnerMeta = useMemo(() => {
    if (!finalWinnerId) return null;

    return {
      id: finalWinnerId,
      name: finalWinnerDisplayName || getNombrePerfil(finalWinnerId) || 'Campeon',
      photo: getFotoPerfil(finalWinnerId),
      location: getLocalidadPerfil(finalWinnerId),
      ranking: getRankingPerfil(finalWinnerId) || getRankingPos(finalWinnerId),
    };
  }, [finalWinnerId, finalWinnerDisplayName, getNombrePerfil, getFotoPerfil, getLocalidadPerfil, getRankingPerfil, getRankingPos]);

  const finalWinnerInitials = useMemo(() => {
    const name = String(finalWinnerMeta?.name || finalWinnerDisplayName || '').trim();
    if (!name) return 'TF';
    return name
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }, [finalWinnerMeta?.name, finalWinnerDisplayName]);

  const championRouteMatchIds = useMemo(() => {
    if (!torneoFinalizado || !finalWinnerId || !finalPartido) return new Set();

    const matchesById = new Map(
      partidos
        .map((partido) => [String(partido?.id || '').trim(), partido])
        .filter(([id]) => Boolean(id))
    );

    const pathIds = new Set();
    let currentMatch = finalPartido;
    let guard = 0;

    while (currentMatch && guard < 32) {
      guard += 1;
      const currentMatchId = String(currentMatch?.id || '').trim();
      if (!currentMatchId) break;

      pathIds.add(currentMatchId);

      const resolved = jugadoresPorPartido[currentMatchId] || {};
      const j1Id = String(resolved?.j1Id || getJugadorId(currentMatch, 1) || '').trim();
      const j2Id = String(resolved?.j2Id || getJugadorId(currentMatch, 2) || '').trim();

      let championSide = null;
      if (j1Id && j1Id === finalWinnerId) championSide = 1;
      if (!championSide && j2Id && j2Id === finalWinnerId) championSide = 2;
      if (!championSide) break;

      const originMatchId = String(getOrigenPartidoId(currentMatch, championSide) || '').trim();
      if (!originMatchId) break;

      currentMatch = matchesById.get(originMatchId) || null;
    }

    return pathIds;
  }, [torneoFinalizado, finalWinnerId, finalPartido, partidos, jugadoresPorPartido]);

  const mutateProgramacion = async (partidoId, slotData, mode) => {
    setMutationBusy(true);
    setStatusMessage(null);

    const payload = {
      cancha_id: slotData.canchaId,
      canchaId: slotData.canchaId,
      fecha_hora: slotData.fechaHora,
      hora: slotData.hora,
      dia: slotData.dia,
      dia_semana: slotData.dia,
      estado: 'Programado',
      forzar: true,
      origen: mode,
    };

    try {
      await runFallbackRequest([
        () => axios.put(`${API_URL}/api/partidos/${partidoId}/reprogramar`, payload),
        () => axios.put(`${API_URL}/api/partidos/${partidoId}/programacion`, payload),
        () => axios.put(`${API_URL}/api/partidos/${partidoId}/horario`, payload),
        () => axios.put(`${API_URL}/api/partidos/${partidoId}`, payload),
      ]);

      setStatusMessage({
        type: 'success',
        text: mode === 'reprogramar' ? 'Partido reprogramado correctamente.' : 'Partido asignado al slot correctamente.',
      });
      await fetchCuadro();
      return true;
    } catch (err) {
      const message = err?.response?.data?.error || 'No se pudo guardar la programacion del partido.';
      setStatusMessage({ type: 'error', text: message });
      return false;
    } finally {
      setMutationBusy(false);
    }
  };

  const handleProgramarPartido = async (partidoId, slotData) => {
    return mutateProgramacion(partidoId, slotData, 'programar');
  };

  const handleReprogramarPartido = async (partidoId, slotData) => {
    return mutateProgramacion(partidoId, slotData, 'reprogramar');
  };

  const handleIniciarPartido = async (partido) => {
    if (!partido?.id) return false;

    setMutationBusy(true);
    setStatusMessage(null);

    const nowIso = new Date().toISOString();
    const payload = {
      estado: 'En Juego',
      inicio_real: partido?.inicio_real || nowIso,
      ultima_actualizacion: nowIso,
      marcador_en_vivo: getScoreDisplay(partido) || '0-0',
      iniciar: true,
    };

    try {
      await runFallbackRequest([
        () => axios.put(`${API_URL}/api/partidos/${partido.id}/iniciar`, payload),
        () => axios.put(`${API_URL}/api/partidos/${partido.id}/estado`, payload),
        () => axios.put(`${API_URL}/api/partidos/${partido.id}`, payload),
      ]);

      setStatusMessage({
        type: 'success',
        text: `Partido P${partido.id} iniciado en vivo.`,
      });
      await fetchCuadro();
      return true;
    } catch (err) {
      const message = err?.response?.data?.error || 'No se pudo iniciar el partido.';
      setStatusMessage({ type: 'error', text: message });
      return false;
    } finally {
      setMutationBusy(false);
    }
  };

  const handleActualizarMarcadorRapido = async (partidoId, marcador) => {
    if (!partidoId) return false;

    const marcadorSanitizado = String(marcador || '').trim();
    if (!marcadorSanitizado) {
      setStatusMessage({ type: 'error', text: 'Ingresa un marcador para actualizar.' });
      return false;
    }

    setMutationBusy(true);
    setStatusMessage(null);

    const nowIso = new Date().toISOString();
    const payload = {
      marcador_en_vivo: marcadorSanitizado,
      score: marcadorSanitizado,
      resultado: marcadorSanitizado,
      ultima_actualizacion: nowIso,
      estado: 'En Juego',
      parcial: true,
    };

    try {
      await runFallbackRequest([
        () => axios.put(`${API_URL}/api/partidos/${partidoId}/marcador`, payload),
        () => axios.put(`${API_URL}/api/partidos/${partidoId}/marcador-en-vivo`, payload),
        () => axios.put(`${API_URL}/api/partidos/${partidoId}`, payload),
      ]);

      setStatusMessage({ type: 'success', text: `Marcador de P${partidoId} actualizado.` });
      setScoreOverrideByPartido((prev) => ({
        ...prev,
        [String(partidoId)]: marcadorSanitizado,
      }));
      cacheScore(partidoId, marcadorSanitizado);
      await fetchCuadro();
      return true;
    } catch (err) {
      const message = err?.response?.data?.error || 'No se pudo actualizar el marcador en vivo.';
      setStatusMessage({ type: 'error', text: message });
      return false;
    } finally {
      setMutationBusy(false);
    }
  };

  const handleFinalizarPartidoRapido = async (partidoId, marcador) => {
    if (!partidoId) return false;

    const marcadorSanitizado = String(marcador || '').trim();
    if (!marcadorSanitizado) {
      setStatusMessage({ type: 'error', text: 'Ingresa un marcador antes de finalizar.' });
      return false;
    }

    setMutationBusy(true);
    setStatusMessage(null);

    const nowIso = new Date().toISOString();
    const payload = {
      estado: 'Finalizado',
      marcador_en_vivo: marcadorSanitizado,
      score: marcadorSanitizado,
      resultado: marcadorSanitizado,
      ultima_actualizacion: nowIso,
      finalizar: true,
      forzar: true,
    };

    try {
      await runFallbackRequest([
        () => axios.put(`${API_URL}/api/partidos/${partidoId}/finalizar`, payload),
        () => axios.put(`${API_URL}/api/partidos/${partidoId}/resultado`, payload),
        () => axios.put(`${API_URL}/api/partidos/${partidoId}`, payload),
      ]);

      setStatusMessage({
        type: 'success',
        text: `Partido P${partidoId} finalizado.`,
      });
      setScoreOverrideByPartido((prev) => ({
        ...prev,
        [String(partidoId)]: marcadorSanitizado,
      }));
      cacheScore(partidoId, marcadorSanitizado);
      await fetchCuadro();
      return true;
    } catch (err) {
      const message = err?.response?.data?.error || 'No se pudo finalizar el partido desde cronograma.';
      setStatusMessage({ type: 'error', text: `${message} Si tu backend exige ganador, usa "Cargar resultado".` });
      return false;
    } finally {
      setMutationBusy(false);
    }
  };

  const openResultadoModal = (partido) => {
    if (!adminMode || !partido?.fecha_hora) return;

    setResultModal({
      open: true,
      partido,
      ganadorId: partido?.ganador_id ? String(partido.ganador_id) : '',
      score: getScoreDisplay(partido),
    });
  };

  const closeResultadoModal = () => {
    setResultModal({ open: false, partido: null, ganadorId: '', score: '' });
  };

  const handleFinalizarPartido = async () => {
    const partidoActual = activeModalPartido || resultModal?.partido;
    if (!partidoActual?.id) return;

    const winnerOptions = getModalPlayerOptions(partidoActual);
    const ganadorRaw = String(resultModal.ganadorId || '').trim();
    const isWinnerInOptions = winnerOptions.some((option) => String(option.id || '').trim() === ganadorRaw);

    if (winnerOptions.length > 0 && !ganadorRaw) {
      alert('Debes seleccionar el ganador del partido.');
      return;
    }

    if (winnerOptions.length > 0 && !isWinnerInOptions) {
      alert('El ganador seleccionado ya no es valido para este partido. Vuelve a seleccionarlo.');
      return;
    }

    if (!resultModal.score.trim()) {
      alert('Debes ingresar el score (ej: 6-4 / 7-5).');
      return;
    }

    setMutationBusy(true);
    setStatusMessage(null);

    const scoreRaw = String(resultModal.score || '').trim();
    const scoreCompact = scoreRaw.replace(/\s*\/\s*/g, ' ').replace(/\s+/g, ' ').trim();
    const nowIso = new Date().toISOString();

    const payloadCandidates = [];

    const baseLowerPayload = {
      estado: 'finalizado',
      estado_partido: 'finalizado',
      marcador_en_vivo: scoreRaw,
      score: scoreRaw,
      resultado: scoreRaw,
      ultima_actualizacion: nowIso,
      finalizar: true,
      forzar: true,
    };

    if (String(partidoActual?.inicio_real || '').trim()) {
      baseLowerPayload.inicio_real = partidoActual.inicio_real;
    }
    if (ganadorRaw) baseLowerPayload.ganador_id = ganadorRaw;
    payloadCandidates.push(baseLowerPayload);

    payloadCandidates.push({
      ...baseLowerPayload,
      estado: 'Finalizado',
      estado_partido: 'Finalizado',
    });

    payloadCandidates.push({
      marcador_en_vivo: scoreCompact || scoreRaw,
      score: scoreCompact || scoreRaw,
      resultado: scoreCompact || scoreRaw,
      ultima_actualizacion: nowIso,
      finalizar: true,
      ...(ganadorRaw ? { ganador_id: ganadorRaw } : {}),
    });

    if (ganadorRaw && /^\d+$/.test(ganadorRaw)) {
      const ganadorNumber = Number(ganadorRaw);
      if (Number.isFinite(ganadorNumber)) {
        payloadCandidates.push({
          ...baseLowerPayload,
          ganador_id: ganadorNumber,
        });
      }
    }

    try {
      const requestFns = payloadCandidates.flatMap((payload) => buildPartidoRequestFallbacks({
        partidoRef: partidoActual,
        torneoId,
        payload,
        suffixes: ['finalizar', 'resultado', 'estado', ''],
      }));

      await runFallbackRequest(requestFns);

      setStatusMessage({
        type: 'success',
        text: 'Resultado guardado. El ganador fue empujado a la siguiente ronda si correspondia.',
      });

      setPartidos((prev) => prev.map((partido) => {
        if (String(partido?.id) !== String(partidoActual.id)) return partido;
        const nextPartido = {
          ...partido,
          estado: 'Finalizado',
          score: resultModal.score,
          resultado: resultModal.score,
          marcador_en_vivo: resultModal.score,
        };
        if (ganadorRaw) nextPartido.ganador_id = ganadorRaw;
        return nextPartido;
      }));

      setScoreOverrideByPartido((prev) => ({
        ...prev,
        [String(partidoActual.id)]: resultModal.score,
      }));
      cacheScore(partidoActual.id, resultModal.score);

      closeResultadoModal();
      await fetchCuadro();
    } catch (err) {
      const message = err?.response?.data?.error || 'No se pudo cargar el resultado del partido.';
      setStatusMessage({ type: 'error', text: message });
    } finally {
      setMutationBusy(false);
    }
  };

  const handlePublicarCronograma = async () => {
    if (!adminMode || !torneoId) return;

    setPublishing(true);
    setStatusMessage(null);

    const payload = {
      torneo_id: torneoId,
      estado: 'cronograma_publicado',
      cronograma_publicado: true,
      notificar_jugadores: true,
    };

    try {
      const response = await runFallbackRequest([
        () => axios.post(`${API_URL}/api/torneos/${torneoId}/cronograma/publicar`, payload),
        () => axios.put(`${API_URL}/api/torneos/${torneoId}/cronograma/publicar`, payload),
        () => axios.post(`${API_URL}/api/torneos/${torneoId}/publicar-cronograma`, payload),
        () => axios.put(`${API_URL}/api/torneos/${torneoId}/estado`, payload),
      ]);

      setStatusMessage({
        type: 'success',
        text: response?.data?.message || 'Cronograma publicado. Los jugadores ya pueden ver sus horarios en Mi Actividad.',
      });
    } catch (err) {
      const message = err?.response?.data?.error || 'No se pudo publicar el cronograma.';
      setStatusMessage({ type: 'error', text: message });
    } finally {
      setPublishing(false);
    }
  };

  const handleFinalizarTorneo = async () => {
    if (!adminMode || !torneoId) return;

    const ganadorId = String(finalPartido?.ganador_id || '').trim();
    if (!ganadorId) {
      setStatusMessage({
        type: 'error',
        text: 'No se puede finalizar el torneo sin un ganador definido en la final.',
      });
      return;
    }

    const confirmed = window.confirm('Se marcara este torneo como finalizado. Deseas continuar?');
    if (!confirmed) return;

    setMutationBusy(true);
    setStatusMessage(null);

    const payload = {
      estado: 'finalizado',
      state: 'finalizado',
      status: 'finalizado',
    };

    try {
      await runFallbackRequest([
        () => axios.put(`${API_URL}/api/torneos/${torneoId}/estado`, payload),
        () => axios.patch(`${API_URL}/api/torneos/${torneoId}/estado`, payload),
        () => axios.put(`${API_URL}/api/torneos/${torneoId}`, payload),
        () => axios.patch(`${API_URL}/api/torneos/${torneoId}`, payload),
      ]);

      setTorneoEstado('finalizado');
      setStatusMessage({
        type: 'success',
        text: 'Torneo finalizado correctamente.',
      });
    } catch (err) {
      const message = err?.response?.data?.error || 'No se pudo finalizar el torneo.';
      setStatusMessage({ type: 'error', text: message });
    } finally {
      setMutationBusy(false);
    }
  };

  const getModalPlayerOptions = useCallback((partido) => {
    const partidoId = String(partido?.id || '').trim();
    const resolved = jugadoresPorPartido[partidoId] || {};

    const options = [
      {
        id: getJugadorId(partido, 1) || resolved.j1Id,
        name: resolved.j1Name || getJugadorNombre(partido, 1),
        ranking: resolved.j1Ranking
          || getJugadorRankingDirecto(partido, 1)
          || getRankingPerfil(getJugadorId(partido, 1) || resolved.j1Id)
          || getRankingPos(getJugadorId(partido, 1) || resolved.j1Id),
      },
      {
        id: getJugadorId(partido, 2) || resolved.j2Id,
        name: resolved.j2Name || getJugadorNombre(partido, 2),
        ranking: resolved.j2Ranking
          || getJugadorRankingDirecto(partido, 2)
          || getRankingPerfil(getJugadorId(partido, 2) || resolved.j2Id)
          || getRankingPos(getJugadorId(partido, 2) || resolved.j2Id),
      },
    ]
      .filter((item) => String(item.id || '').trim())
      .map((item) => ({
        id: String(item.id).trim(),
        name: item.name || 'Jugador',
        ranking: String(item.ranking || '').trim(),
      }));

    const dedup = [];
    const seen = new Set();
    options.forEach((item) => {
      if (seen.has(item.id)) return;
      seen.add(item.id);
      dedup.push(item);
    });

    return dedup;
  }, [jugadoresPorPartido, getRankingPerfil, getRankingPos]);

  const activeModalPartido = useMemo(() => {
    const modalId = String(resultModal?.partido?.id || '').trim();
    if (!modalId) return resultModal.partido;

    const latestPartido = partidos.find((partido) => String(partido?.id || '').trim() === modalId);
    return latestPartido || resultModal.partido;
  }, [partidos, resultModal.partido]);

  const activeModalWinnerOptions = useMemo(
    () => getModalPlayerOptions(activeModalPartido),
    [getModalPlayerOptions, activeModalPartido]
  );

  useEffect(() => {
    if (!resultModal.open) return;

    const selectedWinner = String(resultModal.ganadorId || '').trim();
    if (!selectedWinner) return;

    const isStillValid = activeModalWinnerOptions.some(
      (option) => String(option?.id || '').trim() === selectedWinner
    );

    if (isStillValid) return;

    setResultModal((prev) => ({
      ...prev,
      ganadorId: '',
    }));
  }, [resultModal.open, resultModal.ganadorId, activeModalWinnerOptions]);

  // â”€â”€ Drag-to-pan â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleBracketMouseDown = (e) => {
    if (e.button !== 0) return;
    const el = bracketContainerRef.current;
    if (!el) return;
    dragRef.current = { active: true, startX: e.clientX, startY: e.clientY, scrollX: el.scrollLeft, scrollY: el.scrollTop };
    setIsDragging(true);
  };
  const handleBracketMouseMove = (e) => {
    if (!dragRef.current.active) return;
    const el = bracketContainerRef.current;
    if (!el) return;
    el.scrollLeft = dragRef.current.scrollX - (e.clientX - dragRef.current.startX);
    el.scrollTop = dragRef.current.scrollY - (e.clientY - dragRef.current.startY);
  };
  const handleBracketDragEnd = () => { dragRef.current.active = false; setIsDragging(false); };

  // â”€â”€ Match-card renderer (shared mobile + desktop) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const renderMatchCard = (partido, matchIndex, totalInColumn, connectorSide, fixedSlotH = null) => {
    const partidoKey = String(partido?.id || '').trim();
    const ganadorId = partido?.ganador_id;
    const resolved = jugadoresPorPartido[partidoKey] || {};
    const j1Id = resolved.j1Id || getJugadorId(partido, 1);
    const j2Id = resolved.j2Id || getJugadorId(partido, 2);
    const j1Name = resolved.j1Name || getJugadorNombre(partido, 1);
    const j2Name = resolved.j2Name || getJugadorNombre(partido, 2);
    const j1Ranking = resolved.j1Ranking || getJugadorRankingDirecto(partido, 1) || getRankingPerfil(j1Id) || getRankingPos(j1Id);
    const j2Ranking = resolved.j2Ranking || getJugadorRankingDirecto(partido, 2) || getRankingPerfil(j2Id) || getRankingPos(j2Id);
    const j1Photo = getFotoPerfil(j1Id);
    const j2Photo = getFotoPerfil(j2Id);
    const j1Seed = seedByJugadorId[String(j1Id || '').trim()] || null;
    const j2Seed = seedByJugadorId[String(j2Id || '').trim()] || null;
    const hasGanador = Boolean(ganadorId);
    const estado = getEstadoPartido(partido);
    const hasConflict = isConflictAvailability(partido);
    const slot = formatSlot(partido);
    const score = getScoreDisplay(partido);
    const ganadorKey = String(ganadorId || '').trim();
    const j1Key = String(j1Id || '').trim();
    const j2Key = String(j2Id || '').trim();
    const isChampionRoute = hallOfFameMode && championRouteMatchIds.has(partidoKey);
    const isPlayed = hasGanador || estado.key === 'finalizado';
    const isLive = estado.key === 'en_juego';
    const canchaId = partido?.cancha?.id || partido?.cancha_id;
    const canchaMeta = canchas.find((c) => String(c?.id || '') === String(canchaId || ''));
    const superficie = normalizeSurfaceLabel(partido?.cancha?.superficie || partido?.superficie || canchaMeta?.superficie);
    const isPlayerHovered = Boolean(hoveredPlayerId) && ((j1Key && j1Key === hoveredPlayerId) || (j2Key && j2Key === hoveredPlayerId));
    const isOtherPlayerHovered = Boolean(hoveredPlayerId) && !isPlayerHovered;
    const showV = totalInColumn > 1;
    const parsedSets = score
      ? score.trim().replace(/\s*\/\s*/g, ' ').split(/\s+/).filter((s) => /^\d+-\d+/.test(s))
          .map((s) => { const m = s.match(/^(\d+)-(\d+)/); return m ? [parseInt(m[1], 10), parseInt(m[2], 10)] : null; })
          .filter(Boolean)
      : [];
    const connClass = isChampionRoute || isPlayerHovered
      ? 'border-[#a6ce39] shadow-[0_0_8px_rgba(166,206,57,0.5)]'
      : hasGanador ? 'border-[#a6ce39]/40' : 'border-white/20 group-hover:border-white/35';

    // Vertical connector height: slotH/2 when column has fixed height (desktop ATP),
    // otherwise fall back to CSS-only calc based on gap-8 (mobile).
    const cH = fixedSlotH ? fixedSlotH / 2 : null;
    const vFallback = cH ? '' : 'h-[calc(50%+2rem)] lg:h-[calc(50%+2.5rem)]';
    const vStyleDown = cH ? { top: '50%', height: cH } : { top: '50%' };
    const vStyleUp   = cH ? { bottom: '50%', height: cH } : { bottom: '50%' };

    return (
      <div
        key={partido.id}
        className={`relative group transition-opacity ${isOtherPlayerHovered ? 'opacity-30' : 'opacity-100'}`}
        onMouseLeave={() => setHoveredPlayerId(null)}
      >
        {connectorSide === 'right' && (
          <>
            <div className={`absolute top-1/2 -right-6 w-6 border-b-2 z-0 transition-colors ${connClass}`} />
            {showV && matchIndex % 2 === 0 && <div className={`absolute -right-6 w-0 border-r-2 z-0 transition-colors ${connClass} ${vFallback}`} style={vStyleDown} />}
            {showV && matchIndex % 2 !== 0 && <div className={`absolute -right-6 w-0 border-r-2 z-0 transition-colors ${connClass} ${vFallback}`} style={vStyleUp} />}
            <div className={`absolute top-1/2 -right-12 w-6 border-b-2 z-0 transition-colors ${connClass}`} />
          </>
        )}
        {connectorSide === 'left' && (
          <>
            <div className={`absolute top-1/2 -left-6 w-6 border-b-2 z-0 transition-colors ${connClass}`} />
            {showV && matchIndex % 2 === 0 && <div className={`absolute -left-6 w-0 border-r-2 z-0 transition-colors ${connClass} ${vFallback}`} style={vStyleDown} />}
            {showV && matchIndex % 2 !== 0 && <div className={`absolute -left-6 w-0 border-r-2 z-0 transition-colors ${connClass} ${vFallback}`} style={vStyleUp} />}
            <div className={`absolute top-1/2 -left-12 w-6 border-b-2 z-0 transition-colors ${connClass}`} />
          </>
        )}

        <div className={`relative z-10 rounded-xl border overflow-hidden transition-all ${
          hasConflict
            ? 'border-red-400/60 bg-red-500/10 backdrop-blur-sm shadow-sm'
            : isLive
              ? 'border-[#a6ce39]/50 bg-white/[0.06] backdrop-blur-md shadow-[0_0_24px_rgba(166,206,57,0.2)]'
              : hallOfFameMode
                ? 'border-white/45 bg-white/74 backdrop-blur-md shadow-[0_12px_28px_rgba(15,23,42,0.34)]'
                : 'border-white/10 bg-white/5 backdrop-blur-md shadow-lg hover:border-white/[0.18] hover:bg-white/[0.08]'
        } ${isChampionRoute || isPlayerHovered ? 'ring-1 ring-[#a6ce39]/60 shadow-[0_0_16px_rgba(166,206,57,0.3)]' : ''}`}>
          {isLive && <div className="absolute inset-0 rounded-xl ring-1 ring-[#a6ce39]/60 animate-pulse pointer-events-none z-20" />}

          <div className={`px-3 py-2 text-xs border-b ${hasConflict ? 'bg-red-500/15 border-red-400/20 text-red-300' : isLive ? 'bg-[#a6ce39]/[0.08] border-[#a6ce39]/20 text-[#a6ce39]/90' : hallOfFameMode ? 'bg-white/62 border-white/80 text-slate-600' : 'bg-white/5 border-white/8 text-white/45'}`}>
            <p className="font-semibold">Hora: {slot.timeLabel}</p>
            <p className="font-semibold flex items-center gap-1.5">
              {isLive && <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#a6ce39] animate-pulse" />}
              Cancha: {slot.canchaLabel}
            </p>
          </div>

          {hasConflict && (
            <div className="px-3 py-1.5 text-xs font-bold text-red-300 bg-red-500/10 border-b border-red-400/20 inline-flex items-center gap-1.5">
              <IconAlertTriangle className="h-3.5 w-3.5" />
              Conflicto de disponibilidad
            </div>
          )}

          <button type="button" onClick={() => openResultadoModal(partido)} disabled={!adminMode || !partido?.fecha_hora} className="w-full text-left">
            <div
              className={`flex items-center justify-between px-4 py-3 border-b transition-opacity ${hallOfFameMode ? 'border-white/40 bg-white/55' : 'border-white/8'} ${hasGanador && ganadorKey !== j1Key ? 'opacity-35' : ''}`}
              onMouseEnter={() => j1Key && setHoveredPlayerId(j1Key)}
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className="h-6 w-6 rounded-full border border-white/30 bg-white/20 overflow-hidden shrink-0">
                  {j1Photo ? <img src={j1Photo} alt={j1Name} className="h-full w-full object-cover" /> : <div className="h-full w-full flex items-center justify-center text-[10px] font-bold text-blue-700">{formatRankingLabel(j1Ranking) || ''}</div>}
                </div>
                {j1Seed ? (
                  <span className="shrink-0 inline-flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-b from-[#f5c842] to-[#c98b0a] text-[#1a0a00] text-[10px] font-black shadow ring-1 ring-amber-300/50" title={`${seedLabel(j1Seed)} sembrado`}>{j1Seed}</span>
                ) : null}
                <span className={`font-bold break-words leading-snug transition-colors ${
                  hasGanador && ganadorKey === j1Key ? 'text-[#a6ce39] font-black'
                    : hasGanador && ganadorKey !== j1Key ? 'line-through text-white/25'
                      : hoveredPlayerId === j1Key ? 'text-[#a6ce39]'
                        : hallOfFameMode ? 'text-slate-700' : 'text-white/90'
                }`}>{j1Name}</span>
              </div>
              {hasGanador && ganadorKey === j1Key ? <span className="shrink-0 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#a6ce39] text-[#0d2740] text-[11px] font-black shadow">âœ“</span> : null}
            </div>

            {score && parsedSets.length > 0 ? (
              <div className={`px-4 py-1.5 border-b flex justify-center gap-1.5 ${hallOfFameMode ? 'border-white/50 bg-white/35' : 'border-white/8 bg-white/[0.03]'}`}>
                {parsedSets.map(([a, b], si) => (
                  <div key={si} className="flex flex-col gap-0.5">
                    <span className={`inline-flex items-center justify-center w-6 h-6 rounded text-[11px] font-black border ${a > b ? 'bg-[#a6ce39] text-[#0d2740] border-[#a6ce39]/70' : 'bg-white/10 text-white/45 border-white/10'}`}>{a}</span>
                    <span className={`inline-flex items-center justify-center w-6 h-6 rounded text-[11px] font-black border ${b > a ? 'bg-[#a6ce39] text-[#0d2740] border-[#a6ce39]/70' : 'bg-white/10 text-white/45 border-white/10'}`}>{b}</span>
                  </div>
                ))}
              </div>
            ) : score ? (
              <div className={`px-4 py-1.5 border-b text-center ${hallOfFameMode ? 'border-white/50 bg-white/35' : 'border-white/8 bg-white/[0.03]'}`}>
                <span className={`font-mono text-sm tracking-wide ${hallOfFameMode ? 'font-black text-lg text-slate-800' : 'text-white/60'}`}>{score}</span>
              </div>
            ) : null}

            <div
              className={`flex items-center justify-between px-4 py-3 transition-opacity ${hallOfFameMode ? 'bg-white/55' : ''} ${hasGanador && ganadorKey !== j2Key ? 'opacity-35' : ''}`}
              onMouseEnter={() => j2Key && setHoveredPlayerId(j2Key)}
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className="h-6 w-6 rounded-full border border-white/30 bg-white/20 overflow-hidden shrink-0">
                  {j2Photo ? <img src={j2Photo} alt={j2Name} className="h-full w-full object-cover" /> : <div className="h-full w-full flex items-center justify-center text-[10px] font-bold text-blue-700">{formatRankingLabel(j2Ranking) || ''}</div>}
                </div>
                {j2Seed ? (
                  <span className="shrink-0 inline-flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-b from-[#f5c842] to-[#c98b0a] text-[#1a0a00] text-[10px] font-black shadow ring-1 ring-amber-300/50" title={`${seedLabel(j2Seed)} sembrado`}>{j2Seed}</span>
                ) : null}
                <span className={`font-bold break-words leading-snug transition-colors ${
                  hasGanador && ganadorKey === j2Key ? 'text-[#a6ce39] font-black'
                    : hasGanador && ganadorKey !== j2Key ? 'line-through text-white/25'
                      : hoveredPlayerId === j2Key ? 'text-[#a6ce39]'
                        : hallOfFameMode ? 'text-slate-700' : 'text-white/90'
                }`}>{j2Name}</span>
              </div>
              {hasGanador && ganadorKey === j2Key ? <span className="shrink-0 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#a6ce39] text-[#0d2740] text-[11px] font-black shadow">âœ“</span> : null}
            </div>
          </button>

          <div className={`px-3 py-2 border-t flex flex-col gap-1 text-xs ${hallOfFameMode ? 'border-white/20 text-slate-200' : 'border-white/8 text-white/50'}`}>
            <div className="flex items-center justify-between gap-2">
              <span className={`font-semibold ${hallOfFameMode ? 'text-slate-200/85' : 'text-white/35'}`}>{getCategoriaRama(partido)}</span>
              <span className={`px-2 py-0.5 rounded border font-bold ${estado.badge}`}>{estado.label}</span>
            </div>
            {isPlayed && <span className={`text-[11px] ${hallOfFameMode ? 'text-slate-200/80' : 'text-white/30'}`}>Superficie: {superficie}</span>}
            {adminMode && partido?.fecha_hora && (
              <button type="button" onClick={() => openResultadoModal(partido)} className="mt-1 text-xs font-bold text-[#a6ce39] bg-[#a6ce39]/10 hover:bg-[#a6ce39]/20 border border-[#a6ce39]/30 rounded px-2 py-1 transition-colors">
                Gestionar resultado
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  // â”€â”€ Bracket column renderer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const renderBracketCol = (rondaOrden, colMatches, keyPrefix, connectorSide, { blurMode = false, desktopHeight = undefined } = {}) => {
    if (!colMatches || colMatches.length === 0) return null;
    const roundOrder = Number.parseInt(String(rondaOrden || ''), 10);
    const pointsHint = resolveRoundPointsHint(roundOrder, pointsConfig);
    const roundBadgePoints = roundOrder === 2
      ? toSafeNonNegativeInt(pointsConfig.puntos_campeon, 0)
      : toSafeNonNegativeInt(pointsHint?.badges?.[1]?.value ?? pointsHint?.badges?.[0]?.value, 0);
    const roundBadgeClass = roundOrder === 2
      ? 'from-emerald-300/90 via-emerald-200/90 to-emerald-100/90 text-emerald-950 border-emerald-200/80'
      : 'from-sky-300/90 via-cyan-200/90 to-blue-100/90 text-sky-950 border-sky-200/80';
    const nombreRonda = colMatches[0]?.ronda || `Ronda ${rondaOrden}`;
    const shouldBlur = blurMode && hallOfFameMode;
    return (
      <div
        key={`${keyPrefix}-${rondaOrden}`}
        className={`flex flex-col justify-around w-72 relative pt-14 gap-8 transition-all ${shouldBlur ? 'opacity-45 blur-[1.2px] saturate-[0.6]' : 'opacity-100'}`}
        style={desktopHeight ? { height: `${desktopHeight}px`, gap: 0 } : undefined}
      >
        <div className="absolute top-0 left-0 right-0 text-center">
          <h4 className={`text-xl font-black leading-none mb-1 ${hallOfFameMode ? 'text-white/88 [font-family:Georgia,Times,serif]' : 'text-white/80'}`}>
            {nombreRonda}
          </h4>
          <span className={`inline-flex items-center rounded-full border bg-gradient-to-r px-3 py-1 text-[11px] font-black tracking-wide ${hallOfFameMode ? roundBadgeClass : 'from-[#a6ce39]/20 to-[#a6ce39]/10 text-[#a6ce39] border-[#a6ce39]/30'}`}>
            +{roundBadgePoints} pts ELO
          </span>
        </div>
        {colMatches.map((partido, matchIndex) => renderMatchCard(partido, matchIndex, colMatches.length, connectorSide, desktopHeight ? desktopHeight / colMatches.length : null))}
      </div>
    );
  };

  if (!torneoId) return <div className="text-gray-500">Selecciona un torneo para ver el cuadro.</div>;
  if (loading) return <div className="animate-spin h-8 w-8 border-b-2 border-blue-600 mx-auto mt-10"></div>;
  if (error) return <div className="text-red-500 font-medium">{error}</div>;
  if (partidos.length === 0) return <div className="text-gray-500 mt-4 text-center">El sorteo aun no se ha generado para este torneo.</div>;

  return (
    <div className={`w-full p-6 rounded-2xl mt-6 border transition-colors ${
      hallOfFameMode
        ? 'bg-gradient-to-br from-[#0b1322] via-[#1b2d45] to-[#36281a] border-amber-200/35 shadow-2xl'
        : 'bg-gradient-to-br from-[#0d2740] via-[#16476d] to-[#123a5c] border-white/10 shadow-2xl'
    }}`}>
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-6">
        <div>
          <h3 className="text-2xl font-black tracking-tight uppercase text-white">
            {hallOfFameMode ? 'Cuadro - Salon de la Fama' : 'Gestor de Llaves y Cronograma'}
          </h3>
          <p className="text-sm text-white/60">
            {hallOfFameMode
              ? 'Resultados finales del torneo con foco en la final y el campeon.'
              : 'Visualiza el cuadro, administra horarios/canchas y carga resultados.'}
          </p>
        </div>

        <button
          onClick={fetchCuadro}
          className={`text-sm font-semibold px-4 py-2 rounded-lg border transition-colors ${
            hallOfFameMode
              ? 'text-amber-100 hover:text-white bg-amber-500/20 border-amber-300/45'
              : 'text-white/80 hover:text-white bg-white/10 border-white/15 hover:bg-white/15'
          }`}
        >
          Refrescar
        </button>
      </div>

      <div className="flex items-center gap-2 mb-5">
        <button
          type="button"
          onClick={() => setActiveView('bracket')}
          className={`px-4 py-2 rounded-lg text-sm font-bold border ${
            activeView === 'bracket'
              ? (hallOfFameMode ? 'bg-amber-500 text-[#1e293b] border-amber-400' : 'bg-[#a6ce39] text-[#0d2740] border-[#a6ce39]')
              : 'bg-white/8 text-white/60 border-white/10 hover:bg-white/[0.12]'
          }`}
        >
          Llaves
        </button>
        <button
          type="button"
          onClick={() => setActiveView('cronograma')}
          className={`px-4 py-2 rounded-lg text-sm font-bold border ${
            activeView === 'cronograma'
              ? (hallOfFameMode ? 'bg-amber-500 text-[#1e293b] border-amber-400' : 'bg-[#a6ce39] text-[#0d2740] border-[#a6ce39]')
              : 'bg-white/8 text-white/60 border-white/10 hover:bg-white/[0.12]'
          }`}
        >
          Cronograma
        </button>
      </div>

      {statusMessage && (
        <div
          className={`mb-4 rounded-lg px-4 py-3 text-sm font-semibold border ${
            statusMessage.type === 'success'
              ? 'bg-emerald-500/15 border-emerald-400/30 text-emerald-300'
              : 'bg-red-500/15 border-red-400/30 text-red-300'
          }`}
        >
          {statusMessage.text}
        </div>
      )}

      {activeView === 'cronograma' ? (
        <CronogramaTorneo
          partidos={partidos}
          canchas={canchas}
          adminMode={adminMode}
          onRefresh={fetchCuadro}
          onProgramarPartido={handleProgramarPartido}
          onReprogramarPartido={handleReprogramarPartido}
          onIniciarPartido={handleIniciarPartido}
          onActualizarMarcadorRapido={handleActualizarMarcadorRapido}
          onFinalizarPartidoRapido={handleFinalizarPartidoRapido}
          onAbrirResultado={openResultadoModal}
          onPublicarCronograma={handlePublicarCronograma}
          publishing={publishing}
          actionBusy={mutationBusy}
        />
      ) : (
        <div className="relative">
          <div className={`relative rounded-2xl ${hallOfFameMode ? 'border border-white/20 bg-white/10 backdrop-blur-md pt-4' : ''}`}>
            {hallOfFameMode && (
              <>
                <div className="pointer-events-none absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_20%_20%,rgba(251,191,36,0.18),transparent_40%),radial-gradient(circle_at_80%_15%,rgba(59,130,246,0.18),transparent_35%)]" />
                <div className="pointer-events-none absolute inset-0 rounded-2xl bg-[linear-gradient(120deg,rgba(255,255,255,0.06),transparent_40%,rgba(255,255,255,0.03))]" />
                <div className="pointer-events-none absolute inset-x-[6%] bottom-[18%] h-px bg-white/30" />
                <div className="pointer-events-none absolute inset-x-[14%] bottom-[26%] h-px bg-white/20" />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[38%] rounded-b-2xl bg-[radial-gradient(ellipse_at_bottom,rgba(180,112,63,0.35),rgba(57,39,22,0.16)_52%,transparent_84%)]" />
              </>
            )}

            <div className="w-full">
              {/* â”€â”€ MOBILE: horizontal left-to-right â”€â”€ */}
              <div className="lg:hidden overflow-x-auto scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
                <div className="flex space-x-12 min-w-max mx-auto pb-10 pt-8 px-8">
                  {bracketOrder.map((rondaOrden, colIndex) => {
                    const isFinal = bracketOrder.length - 1 === colIndex;
                    const matches = sortPartidosByOrder(rondas[rondaOrden]);
                    return renderBracketCol(rondaOrden, matches, 'mob', isFinal ? 'none' : 'right', { blurMode: !isFinal });
                  })}
                </div>
              </div>

              {/* â”€â”€ DESKTOP: ATP symmetric â€” drag-to-pan â”€â”€ */}
              <div
                ref={bracketContainerRef}
                className={`hidden lg:block w-full overflow-auto scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent select-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
                style={{ maxHeight: '85vh' }}
                onMouseDown={handleBracketMouseDown}
                onMouseMove={handleBracketMouseMove}
                onMouseUp={handleBracketDragEnd}
                onMouseLeave={handleBracketDragEnd}
              >
                <div className="flex items-stretch justify-center min-w-max mx-auto pb-12 pt-4 px-8">

                  {/* LEFT HALF: outer â†’ inner, connectors â†’ right */}
                  <div className="flex items-stretch gap-12">
                    {nonFinalRounds.map((rondaOrden) => {
                      const allMatches = sortPartidosByOrder(rondas[rondaOrden]);
                      const topMatches = allMatches.slice(0, Math.ceil(allMatches.length / 2));
                      return renderBracketCol(rondaOrden, topMatches, 'left', 'right', { blurMode: true, desktopHeight: symColHeight });
                    })}
                  </div>

                  {/* CENTER: GRAN FINAL */}
                  <div className="flex flex-col items-center justify-center self-center px-10 shrink-0">
                    <div className="text-center mb-6">
                      <div className={`text-[11px] font-black tracking-[0.28em] uppercase mb-1 ${hallOfFameMode ? 'text-amber-400' : 'text-[#a6ce39]/70'}`}>Punto de convergencia</div>
                      <h4 className={`text-3xl font-black tracking-[0.12em] uppercase ${hallOfFameMode ? 'text-amber-200 [font-family:Georgia,Times,serif]' : 'text-white'}`}>
                        Gran Final
                      </h4>
                      <span className={`mt-2 inline-flex items-center rounded-full border bg-gradient-to-r px-4 py-1.5 text-[11px] font-black tracking-wide ${hallOfFameMode ? 'from-emerald-300/90 via-emerald-200/90 to-emerald-100/90 text-emerald-950 border-emerald-200/80' : 'from-[#a6ce39]/25 to-[#a6ce39]/10 text-[#a6ce39] border-[#a6ce39]/35'}`}>
                        +{toSafeNonNegativeInt(pointsConfig.puntos_campeon, 0)} pts ELO â€” CampeÃ³n
                      </span>
                    </div>
                    <div className="w-80">
                      {finalRoundKey && sortPartidosByOrder(rondas[finalRoundKey] || []).map((partido, idx) =>
                        renderMatchCard(partido, idx, 1, 'none')
                      )}
                    </div>
                  </div>

                  {/* RIGHT HALF: inner â†’ outer, connectors â†’ left */}
                  <div className="flex items-stretch gap-12">
                    {[...nonFinalRounds].reverse().map((rondaOrden) => {
                      const allMatches = sortPartidosByOrder(rondas[rondaOrden]);
                      const bottomMatches = allMatches.slice(Math.ceil(allMatches.length / 2));
                      return renderBracketCol(rondaOrden, bottomMatches, 'right', 'left', { blurMode: true, desktopHeight: symColHeight });
                    })}
                  </div>

                </div>
              </div>
            </div>
            {torneoFinalizado && finalWinnerDisplayName && (
              <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center px-4">
                <div className="absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_center,rgba(255,255,255,0)_0%,rgba(2,6,23,0.16)_72%,rgba(2,6,23,0.32)_100%)]"></div>

                <div className="relative flex items-end justify-center">
                  <div className="hidden lg:flex items-end pb-2 absolute -left-[190px] bottom-[-36px]">
                    <img
                      src={trophyHero}
                      alt="Trofeo del campeon"
                      className="h-[390px] w-[285px] object-contain drop-shadow-[0_20px_32px_rgba(251,191,36,0.56)]"
                    />
                  </div>

                  <div className="relative rounded-[36px] border border-amber-300/80 bg-white px-11 py-10 text-center shadow-2xl ring-2 ring-amber-200/90 min-w-[450px] max-w-[96vw]">
                    <div className="absolute inset-0 rounded-[36px] border-2 border-amber-200/80 shadow-[0_0_26px_rgba(251,191,36,0.45)]" />

                    <p className="text-[13px] font-black tracking-[0.28em] text-amber-700 [font-family:Georgia,Times,serif]">CAMPEON</p>

                    <div className="relative mt-4 flex justify-center">
                      <svg viewBox="0 0 260 120" className="absolute top-1/2 -translate-y-1/2 h-[110px] w-[250px] text-amber-300/85" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                        <path d="M24 104C74 80 90 32 118 16" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
                        <path d="M42 108C80 88 96 52 118 34" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
                        <path d="M236 104C186 80 170 32 142 16" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
                        <path d="M218 108C180 88 164 52 142 34" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
                      </svg>

                      <div className="relative h-36 w-36 rounded-full border-4 border-amber-300 bg-gradient-to-br from-amber-100 to-white overflow-hidden shadow-[0_0_0_8px_rgba(251,191,36,0.24)]">
                        {finalWinnerMeta?.photo ? (
                          <img src={finalWinnerMeta.photo} alt={finalWinnerMeta.name} className="h-full w-full object-cover" />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center text-amber-700 font-black text-4xl">{finalWinnerInitials}</div>
                        )}
                      </div>
                    </div>

                    <p className="mt-5 text-5xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-b from-[#f6d67e] to-[#b88315] leading-[1.02] [font-family:Georgia,Times,serif]">
                      {finalWinnerDisplayName}
                    </p>

                    <div className="mt-3 flex justify-center">
                      <div className="relative inline-flex items-center rounded-full border border-amber-200 bg-gradient-to-r from-[#fff1c2] to-[#f7cc60] px-4 py-1.5 text-sm font-black text-amber-900 shadow-[0_6px_16px_rgba(245,158,11,0.28)]">
                        +{toSafeNonNegativeInt(pointsConfig.puntos_campeon, 0)} pts ELO
                      </div>
                    </div>

                    <p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      {`Campeon del torneo${finalizacionFechaLabel ? ` - ${finalizacionFechaLabel}` : ''}`}
                    </p>

                    <div className="mt-3 flex items-center justify-center gap-2 text-xs text-slate-600">
                      {finalWinnerMeta?.ranking ? <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 font-bold">#{finalWinnerMeta.ranking}</span> : null}
                      {finalWinnerMeta?.location ? <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-semibold">{finalWinnerMeta.location}</span> : null}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeView === 'bracket' && adminMode && (
        <div className="mt-2 flex justify-center">
          <button
            type="button"
            onClick={handleFinalizarTorneo}
            disabled={mutationBusy || torneoFinalizado || !finalPartido?.ganador_id}
            className={`rounded-xl px-6 py-3 text-sm font-black tracking-wide border transition-colors ${
              mutationBusy || torneoFinalizado || !finalPartido?.ganador_id
                ? 'bg-white/10 text-white/30 border-white/10 cursor-not-allowed'
                : 'bg-[#a6ce39] text-[#0d2740] border-[#a6ce39] hover:bg-[#95ba32]'
            }`}
          >
            {torneoFinalizado ? 'TORNEO FINALIZADO' : 'FINALIZAR TORNEO'}
          </button>
        </div>
      )}

      {resultModal.open && adminMode && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-xl bg-[#0d2740] rounded-2xl border border-white/10 shadow-xl p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="text-lg font-black text-white">Gestion de Resultado</h4>
                <p className="text-sm text-white/50">Partido P{activeModalPartido?.id || resultModal.partido?.id}</p>
              </div>
              <button
                type="button"
                onClick={closeResultadoModal}
                className="text-sm font-bold text-white/50 hover:text-white"
              >
                Cerrar
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="text-sm font-semibold text-white/80">
                Ganador
                <select
                  value={resultModal.ganadorId}
                  onChange={(event) => setResultModal((prev) => ({ ...prev, ganadorId: event.target.value }))}
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-white/15 bg-white/8 text-white outline-none focus:border-[#a6ce39]/50"
                >
                  <option value="">Seleccionar...</option>
                  {activeModalWinnerOptions.map((option) => (
                    <option key={`winner-${option.id}`} value={option.id}>
                      {option.ranking ? `[${formatRankingLabel(option.ranking)}] ` : ''}{option.name}
                    </option>
                  ))}
                </select>
                {activeModalWinnerOptions.length === 0 && (
                  <p className="mt-1 text-xs text-amber-700">No se pudieron resolver jugadores para este partido en el cuadro.</p>
                )}
              </label>

              <label className="text-sm font-semibold text-white/80">
                Score
                <input
                  type="text"
                  value={resultModal.score}
                  onChange={(event) => setResultModal((prev) => ({ ...prev, score: event.target.value }))}
                  placeholder="Ej: 6-4 / 7-5"
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-white/15 bg-white/8 text-white placeholder:text-white/30 outline-none focus:border-[#a6ce39]/50"
                />
              </label>
            </div>

            <div className="rounded-lg border border-[#a6ce39]/20 bg-[#a6ce39]/8 px-3 py-2 text-xs text-[#a6ce39]/80">
              Al confirmar, el sistema finaliza el partido y empuja automaticamente al ganador a la ronda siguiente.
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={closeResultadoModal}
                className="px-4 py-2 rounded-lg border border-white/15 text-sm font-semibold text-white/60 hover:bg-white/8"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleFinalizarPartido}
                disabled={mutationBusy}
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-500 disabled:opacity-60"
              >
                {mutationBusy ? 'Guardando...' : 'Finalizar y avanzar ganador'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
