import { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { io } from 'socket.io-client';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAuth } from '../context/AuthContext';
import { useClub, useClubPath } from '../context/ClubContext';
import InscripcionModal from '../components/InscripcionModal';
import RankingPlayerCard from '../components/RankingPlayerCard';
import {
  IconAlertTriangle,
  IconArrowRight,
  IconCalendar,
  IconChartBars,
  IconCoin,
  IconCourt,
  IconMailbox,
  IconMedal,
  IconSpark,
  IconTennisBall,
  IconTrophy,
} from '../components/icons/UiIcons';
import { getInscripcionWindowState } from '../lib/inscripcionWindow';
import { resolveProfilePhotoUrl } from '../lib/profilePhoto';
import { supabase } from '../lib/supabase';

const API_URL = '';
const PENDING_START_STORAGE_KEY = 'tennisflow.adminLive.pendingStart.v1';
const LIVE_UPDATE_EVENT = 'tennisflow:live-updated';
const LIVE_UPDATE_STORAGE_KEY = 'tennisflow.live-update.v1';
const ESTADOS_NO_INSCRIPCION = new Set(['borrador', 'cerrado', 'finalizado', 'cancelado', 'suspendido']);
const ESTADOS_FINALIZADOS = new Set(['finalizado', 'disputado', 'completado', 'terminado']);
const ESTADOS_TORNEO_NO_ACTIVO = new Set(['cancelado', 'suspendido', 'finalizado', 'disputado', 'completado', 'terminado']);
const RANKING_MODALIDADES = ['Singles', 'Dobles'];
const RANKING_CATEGORIAS = ['1', '2', '3', '4', '5'];

const FILTER_CHIP_BASE = 'px-3 py-1.5 text-xs font-bold rounded-xl border transition-all duration-150';
const PERFIL_NOMBRE_CACHE = new Map();
const SETGO_NEON_GREEN = '#A6CE39';

const normalizeText = (value) => String(value || '').toLowerCase().trim();
const normalizeCanchaName = (value) => normalizeText(value).replace(/\s+/g, ' ');

const getDateMs = (value, fallback = Number.POSITIVE_INFINITY) => {
  if (!value) return fallback;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : fallback;
};

const getNombreJugadorLive = (jugador) => {
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

const getJugadorPartido = (partido, side) => {
  const jugador = side === 1 ? partido?.jugador1 : partido?.jugador2;
  const pareja = side === 1 ? partido?.jugador1_pareja : partido?.jugador2_pareja;

  const fields = side === 1
    ? ['jugador1_nombre', 'nombre_jugador_1', 'player1_name', 'jugador1_pareja_nombre', 'nombre_pareja_jugador_1']
    : ['jugador2_nombre', 'nombre_jugador_2', 'player2_name', 'jugador2_pareja_nombre', 'nombre_pareja_jugador_2'];

  for (const field of fields) {
    if (partido?.[field]) return partido[field];
  }

  const titularName = getNombreJugadorLive(jugador);
  const parejaName = getNombreJugadorLive(pareja);

  if (titularName && parejaName) {
    return `${titularName} / ${parejaName}`;
  }

  if (titularName) return titularName;
  if (parejaName) return parejaName;

  return 'Por definir';
};

const splitTeamLines = (teamLabel) => {
  const raw = String(teamLabel || '').trim();
  if (!raw) return { line1: 'Por definir', line2: '' };

  const pieces = raw.split('/').map((piece) => piece.trim()).filter(Boolean);
  if (pieces.length <= 1) {
    return { line1: raw, line2: '' };
  }

  return {
    line1: pieces[0],
    line2: pieces.slice(1).join(' / '),
  };
};

const getMarcadorEnVivo = (partido) => String(partido?.marcador_en_vivo || partido?.score || partido?.resultado || partido?.marcador || '0-0');

const getMarcadorLegible = (partido) => {
  const raw = getMarcadorEnVivo(partido);
  const structured = raw.match(/^S(\d+)-(\d+)\s+G(\d+)-(\d+)\s+(?:P([0-9A-Z]+)-([0-9A-Z]+)|TB(\d+)-(\d+))$/i);

  if (!structured) {
    return {
      main: raw,
      detail: null,
      sets: null,
      games: null,
    };
  }

  const [, setsA, setsB, gamesA, gamesB, pA, pB, tbA, tbB] = structured;
  const main = tbA !== undefined && tbB !== undefined
    ? `TB ${tbA}-${tbB}`
    : `${pA}-${pB}`;

  return {
    main,
    detail: `Sets ${setsA}-${setsB} · Games ${gamesA}-${gamesB}`,
    sets: `${setsA}-${setsB}`,
    games: `${gamesA}-${gamesB}`,
  };
};

const splitScorePair = (value) => {
  const matched = String(value || '').trim().match(/^([0-9A-Z]+)-([0-9A-Z]+)$/i);
  if (!matched) return ['--', '--'];
  return [matched[1], matched[2]];
};

const getJugadorPartidoMeta = (partido, side) => {
  const jugador = side === 1 ? partido?.jugador1 : partido?.jugador2;
  const prefix = side === 1 ? 'jugador1' : 'jugador2';
  const altPrefix = side === 1 ? 'player1' : 'player2';

  const nombre = getJugadorPartido(partido, side);
  const teamLines = splitTeamLines(nombre);
  const avatarUrl = String(
    jugador?.foto_url
    ?? jugador?.avatar_url
    ?? jugador?.avatar
    ?? partido?.[`${prefix}_foto_url`]
    ?? partido?.[`${prefix}_avatar_url`]
    ?? partido?.[`${altPrefix}_avatar`]
    ?? ''
  ).trim();

  const countryRaw = String(
    jugador?.pais
    ?? jugador?.country
    ?? jugador?.nacionalidad
    ?? jugador?.localidad
    ?? partido?.[`${prefix}_pais`]
    ?? partido?.[`${prefix}_country`]
    ?? partido?.[`${prefix}_localidad`]
    ?? ''
  ).trim();

  const rankingRaw = jugador?.ranking
    ?? jugador?.ranking_posicion
    ?? jugador?.ranking_position
    ?? jugador?.ranking_singles_posicion
    ?? partido?.[`${prefix}_ranking`]
    ?? partido?.[`${prefix}_ranking_posicion`]
    ?? null;

  const rankingNumber = Number(rankingRaw);
  const rankingLabel = Number.isFinite(rankingNumber) && rankingNumber > 0
    ? `#${rankingNumber}`
    : '--';

  const countryShort = countryRaw
    ? countryRaw.split(/\s+/).filter(Boolean).map((piece) => piece[0]).join('').slice(0, 3).toUpperCase()
    : 'LOC';

  return {
    nombre,
    line1: teamLines.line1,
    line2: teamLines.line2,
    avatarUrl,
    countryLabel: countryRaw || 'Local',
    countryShort,
    rankingLabel,
  };
};

const getJugadorIdCandidatesBySide = (partido, side) => {
  if (side === 1) {
    return [
      partido?.jugador1_id,
      partido?.jugador_1_id,
      partido?.jugador1?.id,
      partido?.j1_id,
      partido?.player1_id,
    ]
      .filter((value) => value !== null && value !== undefined && value !== '')
      .map((value) => String(value));
  }

  return [
    partido?.jugador2_id,
    partido?.jugador_2_id,
    partido?.jugador2?.id,
    partido?.j2_id,
    partido?.player2_id,
  ]
    .filter((value) => value !== null && value !== undefined && value !== '')
    .map((value) => String(value));
};

const getServingSide = (partido) => {
  const sideHint = String(
    partido?.saque_lado
    ?? partido?.server_side
    ?? partido?.servidor_lado
    ?? partido?.saca
    ?? ''
  ).toLowerCase().trim();

  if (['1', 'jugador1', 'player1', 'a', 'left', 'izquierda'].includes(sideHint)) return 1;
  if (['2', 'jugador2', 'player2', 'b', 'right', 'derecha'].includes(sideHint)) return 2;

  const serverIdRaw = partido?.saque_jugador_id
    ?? partido?.servidor_id
    ?? partido?.service_player_id
    ?? partido?.jugador_servicio_id;

  if (serverIdRaw !== null && serverIdRaw !== undefined && serverIdRaw !== '') {
    const serverId = String(serverIdRaw);
    if (getJugadorIdCandidatesBySide(partido, 1).includes(serverId)) return 1;
    if (getJugadorIdCandidatesBySide(partido, 2).includes(serverId)) return 2;
  }

  return null;
};

const getElapsedClock = (partido, nowMs) => {
  const startMs = getDateMs(partido?.inicio_real || partido?.hora_inicio_real, NaN);
  if (!Number.isFinite(startMs) || startMs > nowMs) return '00:00';

  const totalSeconds = Math.max(0, Math.floor((nowMs - startMs) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const getLiveStatusLabels = (partido, marcador) => {
  const raw = getMarcadorEnVivo(partido).toUpperCase();
  const labels = [];
  const [setsA, setsB] = splitScorePair(marcador.sets);
  const setsANum = Number(setsA);
  const setsBNum = Number(setsB);

  if (raw.includes('TB') || marcador.main.startsWith('TB')) {
    labels.push('Tie-break');
  }

  if (/(MP|MATCH\s*POINT)/i.test(raw)) {
    labels.push('Match Point');
  } else if (/P(?:40-AD|AD-40)/i.test(raw)) {
    labels.push('Punto de quiebre');
  }

  if (Number.isFinite(setsANum) && Number.isFinite(setsBNum)) {
    const setsJugados = setsANum + setsBNum;
    if (setsJugados <= 0) labels.push('Primer Set');
    else if (setsJugados === 1) labels.push('Segundo Set');
    else labels.push('Set decisivo');
  } else {
    labels.push('Primer Set');
  }

  return Array.from(new Set(labels)).slice(0, 3);
};

const normalizeSurfaceLabel = (value) => {
  const raw = normalizeText(value);
  if (!raw) return 'A confirmar';
  if (raw.includes('ladrillo')) return 'Polvo de ladrillo';
  if (raw.includes('cesped') || raw.includes('césped')) return 'Cesped';
  if (raw.includes('rapida') || raw.includes('rápida') || raw.includes('dura') || raw.includes('hard')) return 'Cancha rapida';
  return String(value);
};

const formatCountdown = (targetDate, nowMs) => {
  if (!targetDate) return null;
  const targetMs = new Date(targetDate).getTime();
  if (!Number.isFinite(targetMs) || targetMs <= nowMs) return null;

  const diff = targetMs - nowMs;
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);

  return {
    days,
    hours,
    minutes,
  };
};

const getPartidoJugadorIds = (partido) => {
  const candidates = [
    partido?.jugador1_id,
    partido?.jugador2_id,
    partido?.jugador_1_id,
    partido?.jugador_2_id,
    partido?.jugador1?.id,
    partido?.jugador2?.id,
    partido?.j1_id,
    partido?.j2_id,
  ];

  return candidates
    .filter((value) => value !== null && value !== undefined && value !== '')
    .map((value) => String(value));
};

const isUserInPartido = (partido, userId) => {
  if (!userId) return false;
  return getPartidoJugadorIds(partido).includes(String(userId));
};

const isCanchaOcupada = (cancha, partidos) => {
  return partidos.some((partido) => {
    if (!isPartidoEnJuego(partido)) return false;
    const canchaPartido = getCanchaInfoFromPartido(partido);

    if (
      cancha?.id !== null
      && cancha?.id !== undefined
      && cancha?.id !== ''
      && canchaPartido?.id !== null
      && canchaPartido?.id !== undefined
      && canchaPartido?.id !== ''
    ) {
      return String(cancha.id) === String(canchaPartido.id);
    }

    const canchaNombre = normalizeCanchaName(cancha?.nombre);
    const partidoNombre = normalizeCanchaName(canchaPartido?.nombre);
    if (!canchaNombre || !partidoNombre) return false;
    return canchaNombre === partidoNombre;
  });
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

const isTodayDate = (dateValue) => {
  if (!dateValue) return false;
  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) return false;

  const now = new Date();
  return (
    parsed.getFullYear() === now.getFullYear()
    && parsed.getMonth() === now.getMonth()
    && parsed.getDate() === now.getDate()
  );
};

const isTorneoEnCurso = (torneo) => {
  const estado = normalizeText(torneo?.estado);
  return estado.includes('progreso')
    || estado.includes('curso')
    || estado.includes('juego')
    || estado.includes('live');
};

const getLiveCenterCandidates = (torneos = []) => {
  const ordenados = [...torneos]
    .filter((torneo) => !ESTADOS_TORNEO_NO_ACTIVO.has(normalizeText(torneo?.estado)))
    .sort((a, b) => new Date(a.fecha_inicio) - new Date(b.fecha_inicio));

  const enCurso = ordenados.filter(isTorneoEnCurso);
  const hoy = ordenados.filter((torneo) => !isTorneoEnCurso(torneo) && isTodayDate(torneo?.fecha_inicio));
  const resto = ordenados.filter((torneo) => !isTorneoEnCurso(torneo) && !isTodayDate(torneo?.fecha_inicio));

  return [...enCurso, ...hoy, ...resto];
};

const getCanchaInfoFromPartido = (partido) => ({
  id: partido?.cancha_id ?? partido?.cancha?.id ?? null,
  nombre: partido?.cancha?.nombre || partido?.cancha_nombre || partido?.cancha || '',
});

const buildCanchaCatalog = ({ canchas = [], partidos = [] }) => {
  const canchaMap = new Map();
  const canchaKeyById = new Map();
  const canchaKeyByName = new Map();

  const registerCancha = ({ id, nombre }) => {
    const idKey = id !== null && id !== undefined && id !== '' ? `id:${String(id)}` : '';
    const nameKey = normalizeCanchaName(nombre);
    const existingKey = (idKey && canchaKeyById.get(String(id))) || (nameKey && canchaKeyByName.get(nameKey));

    if (existingKey && canchaMap.has(existingKey)) {
      const existing = canchaMap.get(existingKey);
      if ((existing.id === null || existing.id === undefined || existing.id === '') && idKey) {
        existing.id = id;
        canchaKeyById.set(String(id), existingKey);
      }
      if ((!existing.nombre || existing.nombre === 'Sin cancha') && nombre) {
        existing.nombre = nombre;
      }
      if (nameKey) canchaKeyByName.set(nameKey, existingKey);
      return;
    }

    const finalKey = idKey || (nameKey ? `name:${nameKey}` : `generated:${canchaMap.size + 1}`);
    canchaMap.set(finalKey, {
      key: finalKey,
      id: id !== null && id !== undefined && id !== '' ? id : null,
      nombre: nombre || 'Sin cancha',
    });

    if (idKey) canchaKeyById.set(String(id), finalKey);
    if (nameKey) canchaKeyByName.set(nameKey, finalKey);
  };

  canchas.forEach((cancha) => {
    registerCancha({
      id: cancha?.id,
      nombre: cancha?.nombre || cancha?.label || (cancha?.id ? `Cancha ${cancha.id}` : 'Sin cancha'),
    });
  });

  partidos.forEach((partido) => {
    const cancha = getCanchaInfoFromPartido(partido);
    if (cancha.id === null && !cancha.nombre) return;
    registerCancha(cancha);
  });

  return Array.from(canchaMap.values()).sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));
};

// El estado en BD es la fuente de verdad — si el partido dice 'en_juego' (o equivalentes),
// se muestra como vivo en todos los dispositivos sin depender de campos secundarios.
const isPartidoEnJuego = (partido) => {
  const estado = normalizeText(partido?.estado);
  return estado.includes('juego') || estado.includes('curso') || estado.includes('live');
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

const readPendingStartStorage = () => {
  if (typeof window === 'undefined') return {};

  try {
    const raw = window.localStorage.getItem(PENDING_START_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
};

const getPendingStartForTorneo = (torneoId) => {
  if (!torneoId) return {};
  const all = readPendingStartStorage();
  const byTorneo = all?.[String(torneoId)];
  if (!byTorneo || typeof byTorneo !== 'object') return {};

  return Object.fromEntries(
    Object.entries(byTorneo).filter(([partidoId, value]) => {
      if (!String(partidoId || '').trim()) return false;
      if (!value || typeof value !== 'object') return false;
      if (value?.startedExplicitly === true) return true;
      return Boolean(String(value?.inicio_real || '').trim());
    })
  );
};

const applyPendingLiveOverrides = (partidos, torneoId) => {
  const pendingMap = getPendingStartForTorneo(torneoId);
  if (Object.keys(pendingMap).length === 0) return partidos;

  return partidos.map((partido) => {
    const partidoIds = getPartidoIdCandidates(partido);
    const pendingEntry = partidoIds
      .map((id) => pendingMap[id])
      .find(Boolean);

    if (!pendingEntry) return partido;
    if (isPartidoEnJuego(partido)) return partido;

    const safeScore = String(
      pendingEntry?.score
      || partido?.marcador_en_vivo
      || partido?.score
      || partido?.resultado
      || '0-0'
    );

    return {
      ...partido,
      estado: 'en_juego',
      estado_partido: 'en_juego',
      inicio_real: partido?.inicio_real || pendingEntry?.inicio_real,
      marcador_en_vivo: safeScore,
      score: partido?.score || safeScore,
      ultima_actualizacion: pendingEntry?.ultima_actualizacion || partido?.ultima_actualizacion,
    };
  });
};

const parseLiveUpdatePayload = (raw) => {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_) {
    return null;
  }
};

const filterGlobalCanchasByPartidos = (canchas = [], partidos = []) => {
  if (partidos.length === 0 || canchas.length === 0) return canchas;

  const ids = new Set();
  const names = new Set();

  partidos.forEach((partido) => {
    const cancha = getCanchaInfoFromPartido(partido);
    if (cancha.id !== null && cancha.id !== undefined && cancha.id !== '') {
      ids.add(String(cancha.id));
    }
    const normalizedName = normalizeCanchaName(cancha.nombre);
    if (normalizedName) names.add(normalizedName);
  });

  const filtradas = canchas.filter((cancha) => {
    const id = cancha?.id;
    const name = normalizeCanchaName(cancha?.nombre || cancha?.label || '');
    if (id !== null && id !== undefined && id !== '' && ids.has(String(id))) return true;
    return Boolean(name && names.has(name));
  });

  return filtradas.length > 0 ? filtradas : canchas;
};

const loadLiveCenterData = async (torneo, clubId) => {
  if (!torneo?.id) return null;

  const [cuadroRes, canchasTorneoRes] = await Promise.allSettled([
    axios.get(`${API_URL}/api/torneos/${torneo.id}/cuadro`, { params: { club_id: clubId } }),
    axios.get(`${API_URL}/api/torneos/${torneo.id}/canchas`, { params: { club_id: clubId } }),
  ]);

  if (cuadroRes.status === 'rejected') {
    console.error(`[LiveCenter] Error cargando cuadro torneo ${torneo.id}:`, cuadroRes.reason?.message || cuadroRes.reason);
  }
  if (canchasTorneoRes.status === 'rejected') {
    console.warn(`[LiveCenter] Error cargando canchas torneo ${torneo.id}:`, canchasTorneoRes.reason?.message || canchasTorneoRes.reason);
  }

  const partidosRaw = cuadroRes.status === 'fulfilled' ? extractPartidos(cuadroRes.value?.data) : [];
  const partidos = applyPendingLiveOverrides(partidosRaw, torneo.id);

  let canchas = canchasTorneoRes.status === 'fulfilled'
    ? extractCanchas(canchasTorneoRes.value?.data)
    : [];

  if (canchas.length === 0) {
    try {
      const { data } = await axios.get(`${API_URL}/api/canchas`, { params: { club_id: clubId } });
      canchas = filterGlobalCanchasByPartidos(extractCanchas(data), partidos);
    } catch (_) {
      canchas = [];
    }
  }

  return {
    torneo,
    partidos,
    canchas: buildCanchaCatalog({ canchas, partidos }),
    hasLiveMatches: partidos.some(isPartidoEnJuego),
    updatedAt: new Date().toISOString(),
  };
};

// Combina partidos de TODOS los torneos con partidos en vivo, taggeando cada partido con su torneo
const mergeAllLiveCenters = (liveCentersRaw) => {
  const centers = (Array.isArray(liveCentersRaw) ? liveCentersRaw : []).filter(Boolean);
  if (centers.length === 0) return null;

  const primary = centers.find((lc) => lc.hasLiveMatches) || centers[0];

  // Inyecta __torneo_nombre en cada partido para badge en la UI
  const allPartidos = centers.flatMap((lc) =>
    (Array.isArray(lc.partidos) ? lc.partidos : []).map((p) => ({
      ...p,
      __torneo_id: String(lc.torneo?.id || ''),
      __torneo_nombre: String(lc.torneo?.titulo || ''),
    }))
  );

  const allCanchasRaw = centers.flatMap((lc) => (Array.isArray(lc.canchas) ? lc.canchas : []));

  return {
    torneo: primary.torneo,
    torneos: centers.map((lc) => lc.torneo).filter(Boolean),
    partidos: allPartidos,
    canchas: buildCanchaCatalog({ canchas: allCanchasRaw, partidos: allPartidos }),
    hasLiveMatches: allPartidos.some(isPartidoEnJuego),
    updatedAt: new Date().toISOString(),
  };
};

const isTorneoInscribible = (torneo) => {
  const estado = (torneo?.estado || '').toLowerCase();
  if (ESTADOS_NO_INSCRIPCION.has(estado)) return false;
  const ventana = getInscripcionWindowState(torneo);
  return Boolean(ventana?.canRegister);
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
    const nombrePerfil = getNombreCompletoJugador(data);
    const nombreFinal = nombrePerfil || fallbackNombre;
    PERFIL_NOMBRE_CACHE.set(cacheKey, nombreFinal);
    return nombreFinal;
  } catch (_) {
    PERFIL_NOMBRE_CACHE.set(cacheKey, fallbackNombre);
    return fallbackNombre;
  }
};

const normalizeRankingRows = (rows, modalidad) => {
  const safeRows = Array.isArray(rows) ? rows : [];

  return safeRows.map((j, idx) => ({
    ...j,
    id: j?.id || j?.jugador_id || `ranking-${idx}`,
    posicion: idx + 1,
    nombre_completo: getNombreCompletoJugador(j),
    ranking_elo_singles: Number(j?.ranking_elo_singles ?? j?.ranking_elo ?? j?.elo ?? 0),
    ranking_elo_dobles: Number(j?.ranking_elo_dobles ?? j?.ranking_elo ?? j?.elo ?? 0),
    ranking_elo: Number(
      modalidad === 'Dobles'
        ? (j?.ranking_elo_dobles ?? j?.ranking_elo ?? j?.elo ?? 0)
        : (j?.ranking_elo_singles ?? j?.ranking_elo ?? j?.elo ?? 0)
    ),
    ranking_puntos_singles: Number(j?.ranking_puntos_singles ?? j?.ranking_puntos ?? j?.puntos ?? 0),
    ranking_puntos_dobles: Number(j?.ranking_puntos_dobles ?? j?.ranking_puntos ?? j?.puntos ?? 0),
    ranking_puntos: Number(
      modalidad === 'Dobles'
        ? (j?.ranking_puntos_dobles ?? j?.ranking_puntos ?? j?.puntos ?? 0)
        : (j?.ranking_puntos_singles ?? j?.ranking_puntos ?? j?.puntos ?? 0)
    ),
    torneos: Number(j?.torneos ?? j?.torneos_jugados ?? j?.total_torneos ?? 0),
    victorias: Number(j?.victorias ?? j?.partidos_ganados ?? 0),
  }));
};

// ── Skeleton ──────────────────────────────────────────────────────────────────
function Skeleton({ className }) {
  return <div className={`animate-pulse bg-gray-200 rounded-2xl ${className}`} />;
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4"><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
      <Skeleton className="h-52" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6"><Skeleton className="h-64 lg:col-span-2" /><Skeleton className="h-64" /></div>
    </div>
  );
}

// ── Stat Global Card ──────────────────────────────────────────────────────────
function GlobalStatCard({ icon, label, value, gradient }) {
  return (
    <div className={`rounded-2xl border border-white/10 p-5 text-white relative overflow-hidden shadow-[0_18px_44px_rgba(15,23,42,0.18)] ${gradient}`}>
      <div className="absolute inset-0 opacity-20" style={{ background: 'radial-gradient(circle at 80% 20%, rgba(255,255,255,0.92) 0%, transparent 58%)' }} />
      <div className="absolute inset-0 opacity-60" style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.08), transparent 42%, rgba(0,0,0,0.12))' }} />
      <div className="relative">
        <div className="text-3xl mb-2 text-white/90">{icon}</div>
        <div className="text-3xl font-black tracking-tight">{value}</div>
        <div className="text-sm font-medium text-white/80 mt-0.5">{label}</div>
      </div>
    </div>
  );
}

// ── Torneo Hero ───────────────────────────────────────────────────────────────
function TorneoHero({ torneo }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [estadoSolicitud, setEstadoSolicitud] = useState('');
  const pct = torneo.cupos_max ? Math.round((torneo.inscritos_count / torneo.cupos_max) * 100) : 0;
  const ventanaInscripcion = getInscripcionWindowState(torneo);
  const estado = (torneo?.estado || '').toLowerCase();
  const bloqueadoPorEstado = ESTADOS_NO_INSCRIPCION.has(estado);
  const puedeInscribirse = ventanaInscripcion.canRegister && !bloqueadoPorEstado;
  const estadoSolicitudNormalizado = String(estadoSolicitud || '').trim().toLowerCase();
  const solicitudPendiente = estadoSolicitudNormalizado === 'pendiente';
  const solicitudAprobada = estadoSolicitudNormalizado === 'aprobada' || estadoSolicitudNormalizado === 'confirmada';
  const motivoBloqueoEstado = estado === 'borrador'
    ? 'El torneo aun no esta publicado para inscripciones.'
    : 'La inscripcion no esta disponible para el estado actual del torneo.';

  return (
    <>
      <div className="relative rounded-2xl overflow-hidden shadow-xl bg-gradient-to-br from-[#0b1a2e] to-[#0d2a42] p-8 text-white">
        <div className="absolute inset-0 opacity-20 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse at 75% 50%, #d4af37 0%, transparent 65%)' }} />
        <div className="absolute top-4 right-4 text-6xl opacity-10 text-amber-200">
          <IconSpark className="h-12 w-12" />
        </div>
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-end justify-between gap-6">
          <div className="flex-1">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold bg-amber-400/20 text-amber-200 px-3 py-1 rounded-full mb-3 ring-1 ring-amber-300/35">
              <span className="w-1.5 h-1.5 bg-amber-300 rounded-full animate-pulse" />
              PRÓXIMO TORNEO
            </span>
            <h2 className="text-3xl font-black mb-3 leading-tight">{torneo.titulo}</h2>
            <div className="flex flex-wrap gap-4 text-sm text-gray-300 mb-5">
              <span className="inline-flex items-center gap-1.5"><IconCalendar className="h-4 w-4 text-amber-200" />{format(new Date(torneo.fecha_inicio), "d 'de' MMMM, yyyy", { locale: es })}</span>
              {torneo.costo && <span className="inline-flex items-center gap-1.5"><IconCoin className="h-4 w-4 text-amber-200" />${Number(torneo.costo).toLocaleString()}</span>}
            </div>
            {torneo.cupos_max && (
              <div>
                <div className="flex justify-between text-xs mb-1.5 text-gray-400">
                  <span>Inscritos</span>
                  <span className="text-white font-bold">{torneo.inscritos_count} / {torneo.cupos_max}</span>
                </div>
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-amber-300 to-sky-300 rounded-full transition-all"
                    style={{ width: `${pct}%` }} />
                </div>
              </div>
            )}
          </div>
          <div className="flex-shrink-0">
            {(solicitudPendiente || solicitudAprobada) ? (
              <div className={`px-6 py-3 font-bold rounded-2xl ring-1 inline-flex items-center gap-2 ${
                solicitudPendiente
                  ? 'bg-amber-400/20 text-amber-200 ring-amber-300/40'
                  : 'bg-emerald-400/20 text-emerald-200 ring-emerald-300/40'
              }`}>
                <IconTrophy className="h-4 w-4" />
                {solicitudPendiente ? 'Pendiente de aprobacion' : 'Inscripto'}
              </div>
            ) : (
              <div className="space-y-2">
                <button
                  onClick={() => setModalOpen(true)}
                  disabled={!puedeInscribirse}
                  className={`px-8 py-3 font-black rounded-2xl transition-all shadow-lg ${
                    puedeInscribirse
                      ? 'bg-gradient-to-r from-[#0f4c81] to-[#d4af37] text-white hover:scale-105 active:scale-95 shadow-[#0b1a2e]/40'
                      : 'bg-white/10 text-gray-300 cursor-not-allowed shadow-none'
                  }`}
                >
                  {puedeInscribirse
                    ? 'Inscribirme'
                    : bloqueadoPorEstado
                      ? 'Inscripciones proximamente'
                      : (ventanaInscripcion.buttonLabel || 'Inscripcion no habilitada')}
                </button>
                {!puedeInscribirse && (
                  <p className="text-xs text-amber-300 max-w-[260px]">
                    {bloqueadoPorEstado ? motivoBloqueoEstado : ventanaInscripcion.message}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {modalOpen && (
        <InscripcionModal
          torneo={torneo}
          onClose={() => setModalOpen(false)}
          onSuccess={(data) => {
            const estadoRecibido = String(data?.estado_inscripcion || data?.estado || 'pendiente').trim().toLowerCase();
            setEstadoSolicitud(estadoRecibido);
            setModalOpen(false);
          }}
        />
      )}
    </>
  );
}


// ── Ranking Table ─────────────────────────────────────────────────────────────
function RankingSection({ sexo, titulo, jugadorId, clubId }) {
  const toClubPath = useClubPath();
  const [modalidad, setModalidad] = useState('Singles');
  const [categoria, setCategoria] = useState('1');
  const [jugadores, setJugadores] = useState([]);
  const [loadingRankings, setLoadingRankings] = useState(false);
  const [rankingsError, setRankingsError] = useState('');
  const [avatarUrls, setAvatarUrls] = useState({});
  const [avatarErrors, setAvatarErrors] = useState({});
  const [rankingRefreshNonce, setRankingRefreshNonce] = useState(0);
  const [selectedPlayerId, setSelectedPlayerId] = useState('');

  const sexoLabel = sexo === 'Femenino' ? 'Damas' : 'Caballeros';
  const accent = sexo === 'Femenino'
    ? {
      title: 'text-[#8f6a16]',
      chip: 'bg-[#d4af37] text-[#1f2937] border-[#d4af37] shadow-sm shadow-amber-200',
      chipIdle: 'bg-white text-gray-700 border-gray-200 hover:bg-amber-50 hover:border-amber-200',
      summary: 'bg-amber-100 text-amber-800',
      category: 'bg-[#0f4c81] text-white border-[#0f4c81] shadow-sm shadow-blue-200',
      categoryIdle: 'bg-white text-gray-700 border-gray-200 hover:bg-sky-50 hover:border-sky-200',
      rowMe: 'bg-amber-50 ring-1 ring-inset ring-amber-200',
      rowMeText: 'text-amber-800',
      rowMePoints: 'text-amber-700',
      selectedRow: 'bg-amber-50/70 ring-1 ring-inset ring-amber-300',
    }
    : {
      title: 'text-[#0f4c81]',
      chip: 'bg-[#0f4c81] text-white border-[#0f4c81] shadow-sm shadow-blue-200',
      chipIdle: 'bg-white text-gray-700 border-gray-200 hover:bg-blue-50 hover:border-blue-200',
      summary: 'bg-sky-100 text-sky-800',
      category: 'bg-[#d4af37] text-[#1f2937] border-[#d4af37] shadow-sm shadow-amber-200',
      categoryIdle: 'bg-white text-gray-700 border-gray-200 hover:bg-amber-50 hover:border-amber-200',
      rowMe: 'bg-sky-50 ring-1 ring-inset ring-sky-200',
      rowMeText: 'text-sky-800',
      rowMePoints: 'text-sky-700',
      selectedRow: 'bg-sky-50/70 ring-1 ring-inset ring-sky-300',
    };

  useEffect(() => {
    let active = true;

    const fetchTop5ByFilters = async () => {
      setLoadingRankings(true);
      setRankingsError('');

      try {
        const { data } = await axios.get(`${API_URL}/api/rankings`, {
          params: { modalidad, sexo, categoria, club_id: clubId },
        });

        const raw = Array.isArray(data)
          ? data
          : Array.isArray(data?.jugadores)
            ? data.jugadores
            : [];

        const normalizedBase = normalizeRankingRows(raw, modalidad)
          .sort((a, b) => {
            if (b.ranking_puntos !== a.ranking_puntos) return b.ranking_puntos - a.ranking_puntos;

            const aName = String(a?.nombre_completo || '').trim().toLowerCase();
            const bName = String(b?.nombre_completo || '').trim().toLowerCase();
            if (aName !== bName) return aName.localeCompare(bName);

            return String(a?.id || '').localeCompare(String(b?.id || ''));
          })
          .slice(0, 5)
          .map((j, idx) => ({
            ...j,
            posicion: idx + 1,
            es_yo: Boolean(jugadorId && (j?.id === jugadorId || j?.jugador_id === jugadorId)),
          }));

        const normalized = await Promise.all(
          normalizedBase.map(async (j) => ({
            ...j,
            nombre_completo: await resolverNombreCompletoPorPerfil(j, j.nombre_completo, clubId),
          }))
        );

        if (!active) return;
        setJugadores(normalized);
        setSelectedPlayerId((prev) => (
          normalized.some((jugador) => String(jugador.id) === String(prev))
            ? prev
            : ''
        ));
      } catch (_) {
        if (!active) return;
        setRankingsError('No se pudo actualizar este ranking.');
        setSelectedPlayerId('');
      } finally {
        if (active) setLoadingRankings(false);
      }
    };

    fetchTop5ByFilters();

    return () => {
      active = false;
    };
  }, [modalidad, sexo, categoria, jugadorId, rankingRefreshNonce, clubId]);

  useEffect(() => {
    const isLocalhost = typeof window !== 'undefined'
      && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    if (!isLocalhost) return undefined;

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
    let active = true;

    const hydrateAvatars = async () => {
      const entries = await Promise.all(jugadores.map(async (j) => {
        if (!j?.foto_url) return [j.id, ''];
        const resolved = await resolveProfilePhotoUrl(j.foto_url);
        return [j.id, resolved || j.foto_url];
      }));

      if (!active) return;
      setAvatarUrls(Object.fromEntries(entries));
      setAvatarErrors({});
    };

    hydrateAvatars();

    return () => {
      active = false;
    };
  }, [jugadores]);

  const selectedPlayer = jugadores.find((jugador) => String(jugador.id) === String(selectedPlayerId)) || null;

  const renderPosicion = (posicion) => {
    if (posicion === 1) return <IconMedal tone="gold" className="h-5 w-5" />;
    if (posicion === 2) return <IconMedal tone="silver" className="h-5 w-5" />;
    if (posicion === 3) return <IconMedal tone="bronze" className="h-5 w-5" />;
    return <span className="text-base text-slate-500 font-black">{posicion}</span>;
  };

  return (
    <div className="relative bg-gradient-to-br from-white via-slate-50 to-[#f8f3e3] rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
        <div>
          <h3 className={`font-black ${accent.title} inline-flex items-center gap-1.5`}>
            <IconTrophy className="h-4 w-4" />
            {titulo}
          </h3>
          <p className="text-xs text-gray-400">Top 5 · {sexoLabel}</p>
        </div>
        <Link to={toClubPath('/rankings')} className="text-xs font-bold text-[#0f4c81] hover:text-[#0b1a2e] transition-colors inline-flex items-center gap-1">
          Ver todos
          <IconArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-br from-slate-50 to-gray-50">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-2">Modalidad</p>
            <div className="flex flex-wrap gap-2">
              {RANKING_MODALIDADES.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setModalidad(m)}
                  className={`${FILTER_CHIP_BASE} ${
                    modalidad === m
                      ? accent.chip
                      : accent.chipIdle
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-2">Categoria</p>
            <div className="flex flex-wrap gap-2">
              {RANKING_CATEGORIAS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategoria(c)}
                  className={`${FILTER_CHIP_BASE} min-w-[42px] ${
                    categoria === c
                      ? accent.category
                      : accent.categoryIdle
                  }`}
                >
                  {c}a
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
          <span className="font-bold text-gray-500">Mostrando:</span>
          <span className="px-2 py-1 rounded-md bg-slate-100 text-slate-700 font-semibold">{modalidad}</span>
          <span className={`px-2 py-1 rounded-md font-semibold ${accent.summary}`}>{sexoLabel}</span>
          <span className="px-2 py-1 rounded-md bg-amber-100 text-amber-800 font-semibold">{categoria}a</span>
        </div>
      </div>

      <div>
        {loadingRankings ? (
          <p className="text-center text-gray-400 py-8 text-sm">Actualizando ranking...</p>
        ) : jugadores.length === 0 ? (
          <p className="text-center text-gray-400 py-8 text-sm">Sin datos de ranking aún.</p>
        ) : jugadores.map(j => (
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
            className={`flex items-center px-5 py-3 gap-3 border-b border-gray-50 transition-colors cursor-pointer ${
              j.es_yo ? accent.rowMe : 'hover:bg-gray-50/50'
            } ${String(selectedPlayerId) === String(j.id) ? accent.selectedRow : ''}`}
          >
            <span className="w-7 text-center font-bold flex-shrink-0 text-lg inline-flex items-center justify-center">
              {renderPosicion(j.posicion)}
            </span>
            {avatarUrls[j.id] && !avatarErrors[j.id] ? (
              <img
                src={avatarUrls[j.id]}
                alt={j.nombre_completo}
                onError={() => setAvatarErrors((prev) => ({ ...prev, [j.id]: true }))}
                className="w-9 h-9 rounded-full object-cover flex-shrink-0 ring-2 ring-gray-100"
              />
            ) : (
              <div className="w-9 h-9 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-white text-xs font-bold">
                  {j.nombre_completo?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className={`font-bold text-sm truncate ${j.es_yo ? accent.rowMeText : 'text-gray-800'}`}>
                {j.nombre_completo} {j.es_yo && <span className="text-xs text-gray-500 font-normal">(Vos)</span>}
              </p>
            </div>
            <div className="text-right">
              <span className={`block font-black text-sm tabular-nums ${j.es_yo ? accent.rowMePoints : 'text-gray-700'}`}>
                {j.ranking_puntos} pts
              </span>
            </div>
          </div>
        ))}

        {selectedPlayer ? (
          <div
            className="fixed inset-0 z-[80] bg-white/0 backdrop-blur-[2px] flex items-center justify-center p-3 sm:p-6"
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
                compact
                floating
                onClose={() => setSelectedPlayerId('')}
              />
            </div>
          </div>
        ) : null}

        {!loadingRankings && rankingsError && (
          <div className="px-5 py-3 text-xs font-medium text-amber-700 bg-amber-50 border-t border-amber-100">
            {rankingsError}
          </div>
        )}
      </div>
    </div>
  );
}

function LiveCenterStrip({ liveCenter }) {
  const torneo = liveCenter?.torneo;
  const canchasCount = Array.isArray(liveCenter?.canchas) ? liveCenter.canchas.length : 0;
  const partidosCount = Array.isArray(liveCenter?.partidos) ? liveCenter.partidos.length : 0;

  if (!torneo) return null;

  return (
    <section className="rounded-xl border border-sky-200 bg-gradient-to-r from-[#f7fbff] via-white to-[#f6f1df] px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-extrabold uppercase tracking-wider text-[#0f4c81]">Live Center</p>
          <p className="text-sm font-semibold text-gray-700 truncate">
            {torneo.titulo}: sin partidos en vivo por ahora.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2 py-1 font-semibold">
            <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
            En espera
          </span>
          <span>{canchasCount} canchas</span>
          <span>{partidosCount} partidos</span>
        </div>
      </div>
    </section>
  );
}

function LiveBroadcastCard({ match, cardLabel, nowMs, defaultSurface, compact = false }) {
  const marcador = getMarcadorLegible(match);
  const [setsA, setsB] = splitScorePair(marcador.sets);
  const [gamesA, gamesB] = splitScorePair(marcador.games);
  const playerA = getJugadorPartidoMeta(match, 1);
  const playerB = getJugadorPartidoMeta(match, 2);
  const servingSide = getServingSide(match);
  const statusLabels = getLiveStatusLabels(match, marcador);
  const elapsed = getElapsedClock(match, nowMs);
  const cancha = getCanchaInfoFromPartido(match);
  const surfaceLabel = normalizeSurfaceLabel(match?.cancha?.superficie || match?.superficie || defaultSurface);

  const renderPlayer = (player, side) => {
    const isServing = servingSide === side;
    const alignRight = side === 2;
    const initials = player.nombre
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'TF';

    return (
      <div className={`flex flex-col ${alignRight ? 'items-end text-right' : 'items-start text-left'} gap-2 min-w-0`}>
        <div className={`rounded-full border-2 border-white/30 bg-gradient-to-br from-[#c8d8eb] to-[#6d89a8] overflow-hidden shadow-md ${compact ? 'h-9 w-9' : 'h-14 w-14 sm:h-16 sm:w-16'}`}>
          {player.avatarUrl ? (
            <img src={player.avatarUrl} alt={player.nombre} className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full flex items-center justify-center text-white font-black text-sm sm:text-base">{initials}</div>
          )}
        </div>

        <div className="min-w-0">
          <div className="text-white text-sm sm:text-base font-black leading-tight min-w-0">
            <p className={`flex flex-wrap items-center gap-1.5 ${alignRight ? 'justify-end' : 'justify-start'}`}>
              {isServing ? <IconTennisBall className="h-3.5 w-3.5 text-lime-300 flex-shrink-0" /> : null}
              <span className="min-w-0 break-words">{player.line1 || player.nombre}</span>
            </p>
            {player.line2 ? (
              <p className={`mt-0.5 text-[11px] sm:text-xs font-semibold text-white/80 break-words ${alignRight ? 'text-right' : 'text-left'}`}>
                {player.line2}
              </p>
            ) : null}
          </div>
          <div className={`mt-1 flex items-center gap-1.5 text-[10px] sm:text-[11px] text-white/70 ${alignRight ? 'justify-end' : 'justify-start'}`}>
            <span className="inline-flex min-w-[36px] justify-center rounded-md border border-white/30 bg-white/10 px-1.5 py-0.5 font-black tracking-[0.14em] text-white/90">{player.countryShort}</span>
            <span className="truncate max-w-[92px]" title={player.countryLabel}>{player.countryLabel}</span>
            <span className="font-bold text-white/80">{player.rankingLabel}</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <article className={`rounded-2xl border border-white/20 bg-white/10 backdrop-blur-md h-full ${compact ? 'p-3' : 'p-4 sm:p-5'}`}>
      <div className={`flex items-center justify-between gap-2 flex-wrap ${compact ? 'mb-2' : 'mb-4'}`}>
        <p className={`font-black uppercase tracking-[0.16em] text-white/75 ${compact ? 'text-[10px]' : 'text-xs'}`}>{cardLabel}</p>
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          {cancha?.nombre ? (
            <span className="inline-flex items-center rounded-full bg-[#a6ce39]/20 border border-[#a6ce39]/50 px-2 py-0.5 text-[10px] font-black text-[#d4f07a] tracking-wide whitespace-nowrap">
              {cancha.nombre}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1 rounded-full border border-red-200/40 bg-red-500/20 px-2.5 py-1 text-[11px] font-black text-red-100 shadow-[0_0_14px_rgba(248,113,113,0.5)] animate-[pulse_1.8s_ease-in-out_infinite]">
            <span className="w-2 h-2 rounded-full bg-red-300" />
            EN VIVO
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3 md:items-center">
        {renderPlayer(playerA, 1)}

        <div className={`rounded-xl border border-white/20 bg-[#061529]/80 px-3 py-3 ${compact ? 'min-w-[120px]' : 'min-w-[220px]'}`}>
          <div className="grid grid-cols-3 gap-2 items-stretch">
            <div className="rounded-lg border border-white/20 bg-white/10 p-2 text-center">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/70">Sets</p>
              <p className={`mt-1 font-black font-mono text-white ${compact ? 'text-sm' : 'text-lg'}`}>{setsA}-{setsB}</p>
            </div>

            <div className="rounded-lg border border-[#fef08a] bg-[#eaff4d] p-2 text-center shadow-[0_0_20px_rgba(234,255,77,0.38)]">
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#2f2a00]">Game</p>
              <p className={`mt-1 font-black font-mono text-[#1b1b1b] leading-none ${compact ? 'text-base' : 'text-xl'}`}>{marcador.main}</p>
            </div>

            <div className="rounded-lg border border-white/20 bg-white/10 p-2 text-center">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/70">Games</p>
              <p className={`mt-1 font-black font-mono text-white ${compact ? 'text-sm' : 'text-lg'}`}>{gamesA}-{gamesB}</p>
            </div>
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {statusLabels.map((label) => (
              <span key={`${cardLabel}-${label}`} className="inline-flex rounded-full border border-white/25 bg-white/10 px-2 py-0.5 text-[10px] font-bold text-white/85">
                {label}
              </span>
            ))}
            <span className="ml-auto text-[11px] font-mono font-bold text-white/80">{elapsed}</span>
          </div>
        </div>

        {renderPlayer(playerB, 2)}
      </div>

      {!compact && (
        <p className="mt-3 text-[11px] text-white/60">
          Superficie: {surfaceLabel}
        </p>
      )}
    </article>
  );
}

function LiveHeroHub({ liveCenter, nextTorneo, nowMs, isRefreshing = false }) {
  const { club } = useClub();
  const partidos = Array.isArray(liveCenter?.partidos) ? liveCenter.partidos : [];
  const liveMatches = partidos
    .filter(isPartidoEnJuego)
    .sort((a, b) => getDateMs(b?.ultima_actualizacion, getDateMs(b?.inicio_real, 0)) - getDateMs(a?.ultima_actualizacion, getDateMs(a?.inicio_real, 0)));

  const matchCount = liveMatches.length;
  const isCompact = matchCount >= 3;

  if (matchCount > 0) {
    const defaultSurface = liveCenter?.torneo?.superficie || '';

    return (
      <section className="rounded-3xl border border-[#dbe8f4]/70 bg-gradient-to-br from-[#0d2740] via-[#16476d] to-[#123a5c] p-4 sm:p-6 shadow-[0_24px_60px_rgba(15,23,42,0.18)] overflow-hidden relative">
        <div className="absolute inset-0 opacity-25 bg-[radial-gradient(circle_at_15%_20%,rgba(255,255,255,0.25),transparent_45%),radial-gradient(circle_at_90%_15%,rgba(166,206,57,0.16),transparent_34%)]" />
        {isRefreshing && (
          <div className="absolute top-3 right-3 z-10 pointer-events-none">
            <div className="h-3 w-3 rounded-full border-2 border-[#a6ce39]/35 border-t-[#a6ce39] animate-spin" />
          </div>
        )}
        <div className="relative space-y-4">
          <ClubNameGlassCard clubName={club?.nombre} />

          <div
            className={isCompact
              ? 'min-h-[200px] max-h-[520px] overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#a6ce39] [&::-webkit-scrollbar-track]:bg-white/10 [&::-webkit-scrollbar-track]:rounded-full'
              : 'min-h-[200px]'}
          >
            <div className={`grid gap-3 ${isCompact ? 'grid-cols-1 lg:grid-cols-2' : 'lg:grid-cols-2 items-stretch'}`}>
              {liveMatches.map((match, idx) => (
                <LiveBroadcastCard
                  key={match.id ?? idx}
                  match={match}
                  cardLabel={match.__torneo_nombre || (idx === 0 ? 'En Vivo' : 'Partido en curso')}
                  nowMs={nowMs}
                  defaultSurface={defaultSurface}
                  compact={isCompact}
                />
              ))}
              {!isCompact && matchCount === 1 && (
                <article className="rounded-2xl border border-white/20 bg-white/10 backdrop-blur-md p-4 sm:p-5 h-full">
                  <p className="text-xs uppercase font-bold tracking-[0.14em] text-white/65">Partido destacado</p>
                  <p className="text-sm text-white/90 mt-1">No hay otros partidos activos en este momento.</p>
                </article>
              )}
            </div>
          </div>
        </div>
      </section>
    );
  }

  const countdown = formatCountdown(nextTorneo?.fecha_inicio, nowMs);

  return (
    <section className="rounded-3xl border border-[#dbe8f4]/70 bg-gradient-to-br from-[#0d2740] via-[#16476d] to-[#123a5c] p-4 sm:p-6 shadow-[0_24px_60px_rgba(15,23,42,0.18)] overflow-hidden relative">
      <div className="absolute inset-0 opacity-25 bg-[radial-gradient(circle_at_20%_20%,rgba(166,206,57,0.16),transparent_38%),radial-gradient(circle_at_78%_80%,rgba(255,255,255,0.18),transparent_35%)]" />
      {isRefreshing && (
        <div className="absolute top-3 right-3 z-10 pointer-events-none">
          <div className="h-3 w-3 rounded-full border-2 border-[#a6ce39]/35 border-t-[#a6ce39] animate-spin" />
        </div>
      )}
      <div className="relative space-y-4">
        <ClubNameGlassCard clubName={club?.nombre} />

        <div className="rounded-[28px] border border-white/12 bg-[#0b2340]/55 p-5 backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_20px_44px_rgba(6,19,35,0.22)] sm:p-6">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-white/70 mb-2">Proximo Gran Desafio</p>
          <h2 className="text-white text-2xl sm:text-3xl font-black tracking-tight mb-1">{nextTorneo?.titulo || 'Sin torneo programado'}</h2>
          <p className="text-white/72 text-sm inline-flex items-center gap-1.5 mb-4"><IconCalendar className="h-4 w-4" />{nextTorneo?.fecha_inicio ? format(new Date(nextTorneo.fecha_inicio), "d 'de' MMMM, HH:mm", { locale: es }) : 'A confirmar'}</p>

          {countdown ? (
            <div className="grid grid-cols-3 gap-3 max-w-md">
              {[
                { label: 'Dias', value: countdown.days },
                { label: 'Horas', value: countdown.hours },
                { label: 'Min', value: countdown.minutes },
              ].map((item) => (
                <div key={item.label} className="rounded-xl border border-white/14 bg-white/[0.09] p-3 text-center backdrop-blur-sm">
                  <p className="text-2xl font-black text-white">{item.value}</p>
                  <p className="text-[11px] uppercase font-bold tracking-[0.14em] text-white/70">{item.label}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-white/80 text-sm">No hay actividad en vivo ni torneos proximos con fecha confirmada.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function ClubNameGlassCard({ clubName }) {
  const { rolReal } = useAuth();
  const [isVisible, setIsVisible] = useState(false);
  const safeClubName = String(clubName || '').trim();
  const isAdminViewer = rolReal === 'admin' || rolReal === 'super_admin';

  useEffect(() => {
    if (!safeClubName) return undefined;

    setIsVisible(false);
    const frameId = window.requestAnimationFrame(() => {
      setIsVisible(true);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [safeClubName]);

  if (!safeClubName) return null;

  return (
    <div
      className={`relative max-w-full overflow-hidden rounded-[28px] border bg-[#102740]/42 px-5 py-4 backdrop-blur-xl shadow-[0_18px_48px_rgba(5,12,26,0.24)] transition-all duration-700 ease-out motion-reduce:transform-none motion-reduce:transition-none ${
        isVisible ? 'translate-y-0 opacity-100' : 'translate-y-5 opacity-0'
      }`}
      style={{
        borderColor: 'rgba(166, 206, 57, 0.45)',
        boxShadow: '0 0 0 1px rgba(166, 206, 57, 0.12), 0 18px 48px rgba(5, 12, 26, 0.28)',
      }}
    >
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.2),rgba(255,255,255,0.04))]" />
      <div className="pointer-events-none absolute -left-8 top-1/2 h-16 w-16 -translate-y-1/2 rounded-full blur-2xl" style={{ backgroundColor: 'rgba(166, 206, 57, 0.18)' }} />
      <div className="relative flex items-start gap-3 sm:items-center">
        <span className="mt-2 inline-flex h-2.5 w-2.5 rounded-full shadow-[0_0_14px_rgba(166,206,57,0.7)] sm:mt-0" style={{ backgroundColor: SETGO_NEON_GREEN }} />
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#d9f1a1]">Club activo</p>
          {isAdminViewer ? (
            <>
              <h1 className="mt-1 text-xl font-semibold tracking-tight text-white/92 sm:text-2xl">Gestionando <span className="font-black text-white">{safeClubName}</span></h1>
              <p className="mt-1 text-sm text-slate-200/78">Panel operativo en tiempo real con identidad visual del club.</p>
            </>
          ) : (
            <>
              <h1 className="mt-1 text-xl font-semibold tracking-tight text-white/92 sm:text-2xl">Tu club: <span className="font-black text-white">{safeClubName}</span></h1>
              <p className="mt-1 text-sm text-slate-200/78">¡Todo listo para tu próximo set! Revisá la actividad en vivo.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SeasonStatsPanel({ seasonData, loading }) {
  const streakWins = Number(seasonData?.streakWins || 0);

  if (loading) {
    return <div className="rounded-2xl border border-slate-200 bg-white/75 p-4 text-sm text-slate-500">Cargando progreso personal...</div>;
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white/75 backdrop-blur-sm p-4 shadow-sm">
      <h3 className="text-lg font-black text-[#0f4c81] mb-3 inline-flex items-center gap-1.5"><IconChartBars className="h-4 w-4" />Mi Temporada</h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-white to-[#eef5ff] p-3">
          <p className="text-[11px] uppercase tracking-[0.14em] font-bold text-slate-500">Puesto Ranking</p>
          <p className="text-2xl font-black text-[#0f4c81]">{seasonData?.rankingPosition ? `#${seasonData.rankingPosition}` : '--'}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-white to-[#eafbf0] p-3">
          <p className="text-[11px] uppercase tracking-[0.14em] font-bold text-slate-500">Racha Actual</p>
          {streakWins > 0 ? (
            <div className="space-y-0.5">
              <p className="text-2xl font-black text-emerald-600 leading-none">{streakWins}</p>
              <p className="text-sm font-bold text-emerald-700 leading-tight">{streakWins === 1 ? 'victoria' : 'victorias'}</p>
            </div>
          ) : (
            <p className="text-lg font-black text-slate-500 leading-tight">Sin racha</p>
          )}
        </div>
        <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-white to-[#f5f7fb] p-3">
          <p className="text-[11px] uppercase tracking-[0.14em] font-bold text-slate-500">Proximo Partido</p>
          <p className="text-sm font-black text-slate-800">{seasonData?.nextMatchLabel || 'Sin partido programado'}</p>
        </div>
      </div>
    </section>
  );
}

function AdminPendingCard({ tasks }) {
  return (
    <section className="rounded-2xl border border-amber-200 bg-gradient-to-br from-[#fff9e8] to-white p-4 shadow-sm">
      <h3 className="text-lg font-black text-[#8f6a16] mb-3 inline-flex items-center gap-1.5"><IconAlertTriangle className="h-4 w-4" />Tareas Pendientes</h3>
      <div className="space-y-2">
        {tasks.map((task, idx) => (
          <div key={`task-${idx}`} className="rounded-lg border border-amber-100 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
            {task}
          </div>
        ))}
      </div>
    </section>
  );
}

function LeagueActivityFeed({ items }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white/75 backdrop-blur-sm p-4 shadow-sm">
      <h3 className="text-lg font-black text-[#0f4c81] mb-3">Noticias Rapidas</h3>
      <div className="space-y-2.5">
        {items.map((item, idx) => (
          <article key={`feed-${idx}`} className="rounded-xl border border-slate-200 bg-gradient-to-r from-white to-slate-50 px-3 py-2.5 flex items-start gap-2.5">
            <span className="mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-[#0f4c81]">{item.icon}</span>
            <div>
              <p className="text-sm font-semibold text-slate-800">{item.text}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">{item.meta}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function CourtsQuickAccess({ liveCenter }) {
  const canchas = Array.isArray(liveCenter?.canchas) ? liveCenter.canchas : [];
  const partidos = Array.isArray(liveCenter?.partidos) ? liveCenter.partidos : [];

  const entries = canchas.slice(0, 8).map((cancha) => ({
    ...cancha,
    occupied: isCanchaOcupada(cancha, partidos),
  }));

  return (
    <section className="rounded-2xl border border-slate-200 bg-white/75 backdrop-blur-sm p-4 shadow-sm">
      <h3 className="text-lg font-black text-[#0f4c81] mb-3 inline-flex items-center gap-1.5"><IconCourt className="h-4 w-4" />Canchas Ahora</h3>

      {entries.length === 0 ? (
        <p className="text-sm text-slate-500">Sin canchas activas para mostrar.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {entries.map((cancha) => (
            <div key={`quick-court-${cancha.key}`} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-800 truncate">{cancha.nombre}</p>
              <span className={`inline-flex h-2.5 w-2.5 rounded-full ${cancha.occupied ? 'bg-rose-500' : 'bg-emerald-500'}`} title={cancha.occupied ? 'Ocupada' : 'Disponible'} />
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 text-[11px] text-slate-500 inline-flex items-center gap-3">
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" />Disponible</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-500" />Ocupada</span>
      </div>
    </section>
  );
}

// ── Dashboard Principal ───────────────────────────────────────────────────────
export default function DashboardPage() {
  const { user, perfil, isAdmin } = useAuth();
  const { clubId } = useClub();
  const navigate = useNavigate();
  const toClubPath = useClubPath();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [nowMs, setNowMs] = useState(Date.now());
  const [seasonData, setSeasonData] = useState(null);
  const [seasonLoading, setSeasonLoading] = useState(false);
  const [seasonRefreshNonce, setSeasonRefreshNonce] = useState(0);
  const [liveRefreshing, setLiveRefreshing] = useState(false);
  // SWR: refs para stale-while-revalidate
  const stableLiveCenterRef = useRef(null);
  const latestDataRef = useRef(null);
  // Ref estable para el callback de refresh, usado por la suscripción Realtime sin recrearla
  const refreshLiveCenterRef = useRef(null);

  useEffect(() => {
    const intervalId = setInterval(() => setNowMs(Date.now()), 60000);
    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const refreshLiveCenterOnly = async (preferredTorneoId) => {
      setLiveRefreshing(true);
      const previousData = data;
      let torneosPool = [];

      if (previousData?.proximos_torneos || previousData?.torneos_finalizados) {
        const merged = [
          ...(previousData?.proximos_torneos || []),
          ...(previousData?.torneos_finalizados || []),
        ];

        const byId = new Map();
        merged.forEach((torneo) => {
          if (!torneo?.id) return;
          if (!byId.has(String(torneo.id))) byId.set(String(torneo.id), torneo);
        });
        torneosPool = Array.from(byId.values());
      }

      if (torneosPool.length === 0) {
        try {
          const query = supabase.from('torneos').select('*').order('fecha_inicio', { ascending: true });
          if (clubId) query.eq('club_id', clubId);
          const { data: torneosRaw } = await query;
          torneosPool = Array.isArray(torneosRaw) ? torneosRaw : [];
        } catch (_) {
          setLiveRefreshing(false);
          return;
        }
      }

      const candidates = getLiveCenterCandidates(torneosPool);
      const preferredId = preferredTorneoId ? String(preferredTorneoId) : '';

      const reorderedCandidates = preferredId
        ? [
          ...candidates.filter((torneo) => String(torneo.id) === preferredId),
          ...candidates.filter((torneo) => String(torneo.id) !== preferredId),
        ]
        : candidates;

      const allRefreshResults = await Promise.allSettled(
        reorderedCandidates.map((torneo) => loadLiveCenterData(torneo, clubId))
      );
      const liveCenter = mergeAllLiveCenters(
        allRefreshResults.filter((r) => r.status === 'fulfilled').map((r) => r.value)
      );

      if (!liveCenter) {
        setLiveRefreshing(false);
        return;
      }

      setData((prev) => {
        if (!prev) return prev;
        // Blindaje: si la nueva respuesta no tiene partidos en vivo pero la anterior sí,
        // ignoramos esta actualización — puede ser una respuesta transitoria vacía por
        // timing o error de red. El cargarDashboard completo limpiará cuando sea definitivo.
        if (!liveCenter.hasLiveMatches && prev.live_center?.hasLiveMatches) {
          return prev;
        }
        return {
          ...prev,
          live_center: liveCenter,
        };
      });
      setLiveRefreshing(false);
    };

    // Mantener ref actualizada para que la suscripción Realtime siempre llame
    // la versión más reciente sin necesitar recrearse con cada cambio de `data`
    refreshLiveCenterRef.current = refreshLiveCenterOnly;

    const onLiveUpdateEvent = (event) => {
      const payload = parseLiveUpdatePayload(event?.detail);
      refreshLiveCenterOnly(payload?.torneoId);
    };

    const onStorageEvent = (event) => {
      if (event.key !== LIVE_UPDATE_STORAGE_KEY) return;
      const payload = parseLiveUpdatePayload(event.newValue);
      refreshLiveCenterOnly(payload?.torneoId);
    };

    window.addEventListener(LIVE_UPDATE_EVENT, onLiveUpdateEvent);
    window.addEventListener('storage', onStorageEvent);

    return () => {
      window.removeEventListener(LIVE_UPDATE_EVENT, onLiveUpdateEvent);
      window.removeEventListener('storage', onStorageEvent);
    };
  }, [data, clubId]);

  // ── Supabase Realtime: escucha cambios en partidos para TODOS los dispositivos ──
  // Independiente del localStorage del admin — cualquier navegador conectado recibe
  // el evento y refresca el live center cuando un partido cambia de estado.
  useEffect(() => {
    const channel = supabase
      .channel('dashboard-partidos-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'partidos' },
        (payload) => {
          const eventType = payload.eventType;
          const torneoId = payload.new?.torneo_id || payload.old?.torneo_id || null;
          console.info('[Realtime] partido change:', eventType, 'torneo:', torneoId);
          // Llamamos via ref para no reiniciar la suscripción en cada cambio de data
          if (refreshLiveCenterRef.current) {
            refreshLiveCenterRef.current(torneoId);
          }
        },
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          console.info('[Realtime] partidos channel conectado');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('[Realtime] partidos channel error:', err);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    let active = true;

    const cargarDashboard = async () => {
      setLoading(true);

      const torneosQuery = supabase.from('torneos').select('*').order('fecha_inicio', { ascending: true });
      if (clubId) torneosQuery.eq('club_id', clubId);
      const [torneosRes] = await Promise.allSettled([
        torneosQuery,
      ]);

      const torneosRaw = torneosRes.status === 'fulfilled' && Array.isArray(torneosRes.value?.data)
        ? torneosRes.value.data
        : [];

      const torneosOrdenados = [...torneosRaw].sort((a, b) => new Date(a.fecha_inicio) - new Date(b.fecha_inicio));
      const proximos_torneos = torneosOrdenados.filter((t) => !ESTADOS_FINALIZADOS.has((t?.estado || '').toLowerCase()));
      const torneos_finalizados = [...torneosOrdenados]
        .filter((t) => ESTADOS_FINALIZADOS.has((t?.estado || '').toLowerCase()))
        .sort((a, b) => new Date(b.fecha_inicio) - new Date(a.fecha_inicio));
      const candidatosLive = getLiveCenterCandidates(torneosOrdenados);
      const allLiveResults = await Promise.allSettled(
        candidatosLive.map((torneo) => loadLiveCenterData(torneo, clubId))
      );
      const live_center = mergeAllLiveCenters(
        allLiveResults.filter((r) => r.status === 'fulfilled').map((r) => r.value)
      );

      if (!active) return;

      setData({
        proximos_torneos,
        torneos_finalizados,
        live_center,
      });
      setLoading(false);
    };

    cargarDashboard();

    return () => {
      active = false;
    };
  }, [user, clubId]);

  const seasonSourceSignature = useMemo(() => {
    const userId = String(user?.id || '');
    const categoriaPerfil = String(perfil?.categoria_singles ?? perfil?.categoria ?? '');
    const nextFallbackTorneo = Array.isArray(data?.proximos_torneos)
      ? data.proximos_torneos[0]
      : null;

    const livePartidos = Array.isArray(data?.live_center?.partidos)
      ? data.live_center.partidos
      : [];

    const userMatchSlots = livePartidos
      .filter((partido) => isUserInPartido(partido, userId))
      .map((partido) => {
        const partidoId = getPartidoIdCandidates(partido)[0] || '';
        return `${partidoId}:${String(partido?.fecha_hora || '')}`;
      })
      .sort()
      .join('|');

    return [
      userId,
      String(perfil?.sexo || ''),
      categoriaPerfil,
      String(nextFallbackTorneo?.id || ''),
      String(nextFallbackTorneo?.fecha_inicio || ''),
      userMatchSlots,
      String(seasonRefreshNonce),
    ].join('::');
  }, [
    user?.id,
    perfil?.sexo,
    perfil?.categoria_singles,
    perfil?.categoria,
    data?.proximos_torneos,
    data?.live_center?.partidos,
    seasonRefreshNonce,
  ]);

  useEffect(() => {
    const requestSeasonRefresh = () => {
      setSeasonRefreshNonce((prev) => prev + 1);
    };

    const onStorageEvent = (event) => {
      if (event.key !== LIVE_UPDATE_STORAGE_KEY) return;
      requestSeasonRefresh();
    };

    const isLocalhost = typeof window !== 'undefined'
      && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

    let socket = null;
    if (isLocalhost) {
      socket = io(API_URL, { transports: ['websocket', 'polling'] });
      socket.on('ranking_actualizado', requestSeasonRefresh);
    }

    window.addEventListener(LIVE_UPDATE_EVENT, requestSeasonRefresh);
    window.addEventListener('storage', onStorageEvent);

    return () => {
      if (socket) {
        socket.off('ranking_actualizado', requestSeasonRefresh);
        socket.disconnect();
      }
      window.removeEventListener(LIVE_UPDATE_EVENT, requestSeasonRefresh);
      window.removeEventListener('storage', onStorageEvent);
    };
  }, []);

  useEffect(() => {
    let active = true;

    const cargarTemporada = async () => {
      if (!user?.id) {
        setSeasonData(null);
        setSeasonLoading(false);
        return;
      }

      setSeasonLoading(true);

      try {
        const sexoPerfil = perfil?.sexo || 'Masculino';
        const categoriaPerfil = String(perfil?.categoria_singles ?? perfil?.categoria ?? '3');

        const [statsRes, rankingRes] = await Promise.allSettled([
          axios.get(`${API_URL}/api/dashboard`, { params: { jugador_id: user.id, club_id: clubId } }),
          axios.get(`${API_URL}/api/rankings`, {
            params: {
              modalidad: 'Singles',
              sexo: sexoPerfil,
              categoria: categoriaPerfil,
              club_id: clubId,
            },
          }),
        ]);

        if (!active) return;

        const stats = statsRes.status === 'fulfilled'
          ? (statsRes.value?.data?.estadisticas_jugador || statsRes.value?.data || {})
          : {};

        let rankingPosition = null;
        if (rankingRes.status === 'fulfilled') {
          const rankingRowsRaw = Array.isArray(rankingRes.value?.data)
            ? rankingRes.value.data
            : Array.isArray(rankingRes.value?.data?.jugadores)
              ? rankingRes.value.data.jugadores
              : [];

          const rankingRows = normalizeRankingRows(rankingRowsRaw, 'Singles')
            .sort((a, b) => b.ranking_puntos - a.ranking_puntos);

          const foundIndex = rankingRows.findIndex((row) => String(row?.id || row?.jugador_id) === String(user.id));
          rankingPosition = foundIndex >= 0 ? foundIndex + 1 : null;
        }

        const nowReference = Date.now();
        const livePartidos = Array.isArray(data?.live_center?.partidos) ? data.live_center.partidos : [];
        const nextUserMatch = livePartidos
          .filter((partido) => isUserInPartido(partido, user.id))
          .filter((partido) => getDateMs(partido?.fecha_hora, Number.POSITIVE_INFINITY) >= nowReference)
          .sort((a, b) => getDateMs(a?.fecha_hora, Number.POSITIVE_INFINITY) - getDateMs(b?.fecha_hora, Number.POSITIVE_INFINITY))[0] || null;

        const fallbackTorneo = (data?.proximos_torneos || [])[0] || null;
        let nextMatchLabel = 'Sin partido programado';

        if (nextUserMatch?.fecha_hora) {
          nextMatchLabel = `${format(new Date(nextUserMatch.fecha_hora), "EEE d MMM · HH:mm", { locale: es })}`;
        } else if (fallbackTorneo?.fecha_inicio) {
          nextMatchLabel = `${format(new Date(fallbackTorneo.fecha_inicio), "EEE d MMM · HH:mm", { locale: es })}`;
        }

        const streakRaw = Number(
          stats?.racha_actual
          ?? stats?.winning_streak
          ?? stats?.streak
          ?? stats?.racha
          ?? 0
        );

        const streakWins = Number.isFinite(streakRaw) && streakRaw > 0
          ? streakRaw
          : (Number(stats?.victorias || 0) >= 3 ? Math.min(5, Number(stats?.victorias || 0)) : 0);

        const nextSeasonData = {
          rankingPosition,
          streakWins,
          streakLabel: streakWins > 0 ? `${streakWins} victorias` : 'Sin racha',
          nextMatchLabel,
        };

        setSeasonData((prev) => {
          if (
            prev
            && prev.rankingPosition === nextSeasonData.rankingPosition
            && prev.streakWins === nextSeasonData.streakWins
            && prev.streakLabel === nextSeasonData.streakLabel
            && prev.nextMatchLabel === nextSeasonData.nextMatchLabel
          ) {
            return prev;
          }

          return nextSeasonData;
        });
      } finally {
        if (active) setSeasonLoading(false);
      }
    };

    cargarTemporada();

    return () => {
      active = false;
    };
  }, [user?.id, perfil?.sexo, perfil?.categoria_singles, perfil?.categoria, seasonSourceSignature, clubId]);

  useEffect(() => {
    if (!data?.live_center?.hasLiveMatches) return undefined;

    const intervalId = setInterval(async () => {
      try {
        setLiveRefreshing(true);
        const currentData = latestDataRef.current;
        const torneosPool = [
          ...(currentData?.proximos_torneos || []),
          ...(currentData?.torneos_finalizados || []),
        ].filter((t, i, arr) => arr.findIndex((x) => String(x.id) === String(t.id)) === i);

        const candidates = getLiveCenterCandidates(torneosPool);
        if (candidates.length === 0) return;

        const results = await Promise.allSettled(
          candidates.map((torneo) => loadLiveCenterData(torneo, clubId))
        );
        const merged = mergeAllLiveCenters(
          results.filter((r) => r.status === 'fulfilled').map((r) => r.value)
        );

        setData((prev) => {
          if (!prev) return prev;
          // Guarda SWR: nunca reemplazar partidos vivos con respuesta vacía
          if (!merged || (!merged.hasLiveMatches && prev.live_center?.hasLiveMatches)) {
            return prev;
          }
          return { ...prev, live_center: merged };
        });
      } catch (_) {
        // Error silencioso — mantener estado existente
      } finally {
        setLiveRefreshing(false);
      }
    }, 15000);

    return () => clearInterval(intervalId);
  }, [data?.live_center?.hasLiveMatches, clubId]);

  // SWR: mantener referencia al dato más reciente para closures de interval
  latestDataRef.current = data;

  const {
    proximos_torneos = [],
    torneos_finalizados = [],
    live_center: rawLiveCenter = null,
  } = data || {};

  // Stale-while-revalidate: guardar último estado con partidos en vivo
  if (rawLiveCenter?.hasLiveMatches) {
    stableLiveCenterRef.current = rawLiveCenter;
  }
  // Mostrar datos stale mientras se revalida; datos frescos una vez completado
  const live_center = (liveRefreshing && stableLiveCenterRef.current)
    ? stableLiveCenterRef.current
    : rawLiveCenter;

  const torneoHero = proximos_torneos.find(isTorneoInscribible) || null;
  const nextTorneo = proximos_torneos[0] || null;
  const ultimosTorneosDisputados = torneos_finalizados.slice(0, 5);

  const livePartidos = useMemo(
    () => (Array.isArray(live_center?.partidos) ? live_center.partidos : []),
    [live_center?.partidos]
  );
  const liveCanchas = useMemo(
    () => (Array.isArray(live_center?.canchas) ? live_center.canchas : []),
    [live_center?.canchas]
  );

  const isAdminUser = Boolean(isAdmin);

  const liveMatchesCount = useMemo(
    () => livePartidos.filter(isPartidoEnJuego).length,
    [livePartidos]
  );

  const occupiedCourtsCount = useMemo(
    () => liveCanchas.filter((cancha) => isCanchaOcupada(cancha, livePartidos)).length,
    [liveCanchas, livePartidos]
  );

  const activityFeed = useMemo(() => {
    const items = [];

    if (live_center?.torneo) {
      items.push({
        icon: <IconSpark className="h-4 w-4" />,
        text: liveMatchesCount > 0
          ? `${liveMatchesCount} partido${liveMatchesCount === 1 ? '' : 's'} en vivo en ${live_center.torneo.titulo}`
          : `${live_center.torneo.titulo} activo sin partidos en vivo por ahora`,
        meta: `${liveCanchas.length} cancha${liveCanchas.length === 1 ? '' : 's'} monitoreada${liveCanchas.length === 1 ? '' : 's'}`,
      });
    }

    if (nextTorneo?.titulo) {
      items.push({
        icon: <IconCalendar className="h-4 w-4" />,
        text: `Proximo torneo: ${nextTorneo.titulo}`,
        meta: nextTorneo?.fecha_inicio
          ? format(new Date(nextTorneo.fecha_inicio), "EEE d MMM, HH:mm", { locale: es })
          : 'Fecha por confirmar',
      });
    }

    items.push({
      icon: <IconMedal className="h-4 w-4" tone="gold" />,
      text: seasonData?.rankingPosition
        ? `Estas en el puesto #${seasonData.rankingPosition} del ranking Singles`
        : 'Posicion de ranking en proceso de actualizacion',
      meta: seasonData?.streakLabel || 'Sin racha activa',
    });

    if (ultimosTorneosDisputados[0]?.titulo) {
      items.push({
        icon: <IconTrophy className="h-4 w-4" />,
        text: `Ultimo cierre: ${ultimosTorneosDisputados[0].titulo}`,
        meta: ultimosTorneosDisputados[0]?.fecha_inicio
          ? format(new Date(ultimosTorneosDisputados[0].fecha_inicio), "d MMM yyyy", { locale: es })
          : 'Resultado actualizado',
      });
    }

    if (items.length === 0) {
      return [{
        icon: <IconSpark className="h-4 w-4" />,
        text: 'Sin novedades urgentes en este momento.',
        meta: 'El hub se actualiza automaticamente en tiempo real.',
      }];
    }

    return items.slice(0, 5);
  }, [live_center?.torneo, liveMatchesCount, liveCanchas.length, nextTorneo, seasonData?.rankingPosition, seasonData?.streakLabel, ultimosTorneosDisputados]);

  const adminTasks = useMemo(() => {
    if (!isAdminUser) return [];

    const tasks = [];
    const torneosBorrador = proximos_torneos.filter((torneo) => normalizeText(torneo?.estado) === 'borrador').length;
    const torneosSinFecha = proximos_torneos.filter((torneo) => !torneo?.fecha_inicio).length;
    const partidosSinCancha = livePartidos.filter((partido) => {
      if (!isPartidoEnJuego(partido)) return false;
      const cancha = getCanchaInfoFromPartido(partido);
      return !cancha?.id && !normalizeCanchaName(cancha?.nombre);
    }).length;

    if (torneosBorrador > 0) {
      tasks.push(`${torneosBorrador} torneo${torneosBorrador === 1 ? '' : 's'} en borrador listo${torneosBorrador === 1 ? '' : 's'} para publicar.`);
    }
    if (torneosSinFecha > 0) {
      tasks.push(`${torneosSinFecha} torneo${torneosSinFecha === 1 ? '' : 's'} pendiente${torneosSinFecha === 1 ? '' : 's'} de fecha de inicio.`);
    }
    if (partidosSinCancha > 0) {
      tasks.push(`${partidosSinCancha} partido${partidosSinCancha === 1 ? '' : 's'} en vivo sin cancha asignada.`);
    }
    if (liveCanchas.length > 0 && occupiedCourtsCount === 0 && liveMatchesCount > 0) {
      tasks.push('Hay partidos en vivo sin estado de ocupacion visible en canchas.');
    }

    if (tasks.length === 0) {
      tasks.push('Sin pendientes criticos. Operacion estable en este momento.');
    }

    return tasks.slice(0, 4);
  }, [isAdminUser, proximos_torneos, livePartidos, liveCanchas.length, occupiedCourtsCount, liveMatchesCount]);

  const globalStats = useMemo(() => ([
    {
      key: 'live',
      icon: <IconSpark className="h-7 w-7" />,
      label: 'Partidos En Vivo',
      value: liveMatchesCount,
      gradient: 'bg-gradient-to-br from-[#0a2138] via-[#0f4c81] to-[#2b83cd]',
    },
    {
      key: 'courts',
      icon: <IconCourt className="h-7 w-7" />,
      label: 'Canchas Ocupadas',
      value: `${occupiedCourtsCount}/${liveCanchas.length || 0}`,
      gradient: 'bg-gradient-to-br from-[#081321] via-[#16314c] to-[#365c7d]',
    },
    {
      key: 'upcoming',
      icon: <IconCalendar className="h-7 w-7" />,
      label: 'Torneos Activos',
      value: proximos_torneos.length,
      gradient: 'bg-gradient-to-br from-[#5f4610] via-[#8f6a16] to-[#dcb845]',
    },
    {
      key: 'rank',
      icon: <IconChartBars className="h-7 w-7" />,
      label: 'Tu Ranking',
      value: seasonData?.rankingPosition ? `#${seasonData.rankingPosition}` : '--',
      gradient: 'bg-gradient-to-br from-[#173425] via-[#245f3a] to-[#3ea264]',
    },
  ]), [liveMatchesCount, occupiedCourtsCount, liveCanchas.length, proximos_torneos.length, seasonData?.rankingPosition]);

  if (loading) return <DashboardSkeleton />;

  return (
    <div className="space-y-6 rounded-3xl bg-gradient-to-b from-[#f7fbff] via-[#f8fafc] to-[#f6f1df] p-2 sm:p-3">

      <LiveHeroHub liveCenter={live_center} nextTorneo={nextTorneo} nowMs={nowMs} isRefreshing={liveRefreshing} />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {globalStats.map((stat) => (
          <GlobalStatCard
            key={stat.key}
            icon={stat.icon}
            label={stat.label}
            value={stat.value}
            gradient={stat.gradient}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <LeagueActivityFeed items={activityFeed} />

          {!live_center?.hasLiveMatches && (
            live_center?.torneo
              ? <LiveCenterStrip liveCenter={live_center} />
              : (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white/80 p-5 text-sm text-slate-600">
                  Aun no hay un torneo activo para seguimiento en tiempo real.
                </div>
              )
          )}

          <div className="bg-gradient-to-br from-white via-slate-50 to-[#f8f3e3] rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between gap-3">
              <div>
                <h3 className="font-black text-gray-800 inline-flex items-center gap-1.5">
                  <IconTrophy className="h-4 w-4 text-[#8f6a16]" />
                  Ultimos torneos cerrados
                </h3>
                <p className="text-xs text-gray-400">Acceso directo a resultados y cuadro final</p>
              </div>
              <Link to={toClubPath('/torneos')} className="text-xs font-bold text-[#0f4c81] hover:text-[#0b1a2e] transition-colors inline-flex items-center gap-1">
                Ver torneos
                <IconArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            {ultimosTorneosDisputados.length === 0 ? (
              <p className="text-center text-gray-400 py-8 text-sm">Todavia no hay torneos disputados.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4">
                {ultimosTorneosDisputados.slice(0, 4).map((torneo) => (
                  <button
                    key={torneo.id}
                    onClick={() => navigate(toClubPath(`/bracket/${torneo.id}`))}
                    className="text-left rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-[#f8f3e3] px-4 py-4 hover:shadow-md hover:border-[#0f4c81]/40 transition-all group"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide">
                        Finalizado
                      </span>
                      <span className="text-gray-300 group-hover:text-[#0f4c81] transition-colors"><IconArrowRight className="h-4 w-4" /></span>
                    </div>
                    <p className="font-black text-gray-800 leading-tight group-hover:text-[#0f4c81] transition-colors line-clamp-2">
                      {torneo.titulo}
                    </p>
                    <p className="text-xs text-gray-500 mt-2 inline-flex items-center gap-1.5"><IconCalendar className="h-3.5 w-3.5" />{format(new Date(torneo.fecha_inicio), "d MMM yyyy", { locale: es })}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          {isAdminUser ? <AdminPendingCard tasks={adminTasks} /> : <SeasonStatsPanel seasonData={seasonData} loading={seasonLoading} />}
          <CourtsQuickAccess liveCenter={live_center} />

          {torneoHero ? (
            <TorneoHero torneo={torneoHero} jugadorId={user?.id} />
          ) : (
            <div className="bg-gradient-to-br from-[#f8fbff] to-[#f2ead0] rounded-2xl p-6 text-center border border-dashed border-[#d5c086]">
              <div className="inline-flex items-center justify-center rounded-2xl border border-[#d9c58b] bg-white/70 p-3 mb-3 text-[#0f4c81]">
                <IconMailbox className="h-7 w-7" />
              </div>
              <h2 className="text-base font-black text-[#0f4c81]">Sin inscripciones abiertas ahora</h2>
              <p className="text-slate-500 text-sm mt-1">El proximo torneo habilitado aparecera aqui automaticamente.</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Rankings separados por sexo ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <RankingSection
          sexo="Masculino"
          titulo="Ranking Caballeros"
          jugadorId={user?.id}
          clubId={clubId}
        />
        <RankingSection
          sexo="Femenino"
          titulo="Ranking Damas"
          jugadorId={user?.id}
          clubId={clubId}
        />
      </div>
    </div>
  );
}
