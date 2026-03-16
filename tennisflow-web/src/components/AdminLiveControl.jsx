/* eslint-disable react/prop-types */
import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const API_URL = '';
const FINAL_FLASH_MS = 18000;
const PENDING_START_STORAGE_KEY = 'tennisflow.adminLive.pendingStart.v1';
const NEXT_CHOICE_STORAGE_KEY = 'tennisflow.adminLive.nextChoice.v1';
const LOCAL_FINALIZED_STORAGE_KEY = 'tennisflow.adminLive.localFinalized.v1';
const LIVE_UPDATE_EVENT = 'tennisflow:live-updated';
const LIVE_UPDATE_STORAGE_KEY = 'tennisflow.live-update.v1';
const GHOST_WARNING_PREFIX = 'Se detectaron partidos en vivo inconsistentes';
const GHOST_WARNING_HIDE_MS = 7000;

const normalizeText = (value) => String(value || '').toLowerCase().trim();
const normalizeCanchaName = (value) => normalizeText(value).replace(/\s+/g, ' ');

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

const getCanchaInfoFromPartido = (partido) => ({
  id: partido?.cancha_id ?? partido?.cancha?.id ?? null,
  nombre: partido?.cancha?.nombre || partido?.cancha_nombre || partido?.cancha || '',
});

const getCanchaLabel = (cancha) => cancha?.nombre || cancha?.label || (cancha?.id ? `Cancha ${cancha.id}` : 'Cancha');

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
      tipo_superficie: '',
    });

    if (idKey) canchaKeyById.set(String(id), finalKey);
    if (nameKey) canchaKeyByName.set(nameKey, finalKey);
  };

  canchas.forEach((cancha) => {
    registerCancha({ id: cancha?.id, nombre: getCanchaLabel(cancha) });
    const idKey = cancha?.id !== null && cancha?.id !== undefined && cancha?.id !== '' ? canchaKeyById.get(String(cancha.id)) : null;
    if (idKey && canchaMap.has(idKey)) {
      canchaMap.set(idKey, {
        ...canchaMap.get(idKey),
        tipo_superficie: cancha?.tipo_superficie || canchaMap.get(idKey).tipo_superficie || '',
      });
    }
  });

  partidos.forEach((partido) => {
    const cancha = getCanchaInfoFromPartido(partido);
    if (cancha.id === null && !cancha.nombre) return;
    registerCancha(cancha);
  });

  return Array.from(canchaMap.values()).sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));
};

const getPartidoEstadoKey = (partido) => {
  const estado = normalizeText(partido?.estado);
  if (estado.includes('final') || estado.includes('complet') || estado.includes('termin') || partido?.ganador_id) return 'finalizado';
  if (estado.includes('juego') || estado.includes('curso') || estado.includes('live')) return 'en_juego';
  return 'programado';
};

const getDateMs = (value, fallback = Number.POSITIVE_INFINITY) => {
  if (!value) return fallback;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : fallback;
};

const matchCancha = (partido, cancha) => {
  const canchaPartido = getCanchaInfoFromPartido(partido);
  const canchaHasId = cancha?.id !== null && cancha?.id !== undefined && cancha?.id !== '';
  const partidoHasId = canchaPartido?.id !== null && canchaPartido?.id !== undefined && canchaPartido?.id !== '';

  if (canchaHasId && partidoHasId) {
    return String(cancha.id) === String(canchaPartido.id);
  }

  // If only one side has an ID, don't fallback to name matching to avoid cross-court leakage.
  if (canchaHasId !== partidoHasId) return false;

  const canchaNombre = normalizeCanchaName(cancha?.nombre);
  const partidoNombre = normalizeCanchaName(canchaPartido?.nombre);
  if (!canchaNombre || !partidoNombre) return false;
  return canchaNombre === partidoNombre;
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

const getJugadorNombre = (partido, side) => {
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

  return side === 1 ? 'Jugador A' : 'Jugador B';
};

const getJugadorId = (partido, side) => {
  const jugador = side === 1 ? partido?.jugador1 : partido?.jugador2;
  const fields = side === 1
    ? ['jugador1_id', 'player1_id', 'participante1_id', 'competidor1_id', 'jugador_1_id', 'id_jugador_1']
    : ['jugador2_id', 'player2_id', 'participante2_id', 'competidor2_id', 'jugador_2_id', 'id_jugador_2'];

  const values = [
    jugador?.id,
    ...fields.map((field) => partido?.[field]),
  ];

  for (const value of values) {
    if (value === null || value === undefined) continue;
    const safe = String(value).trim();
    if (safe) return safe;
  }

  return '';
};

const getOrigenPartidoId = (partido, side) => {
  const fields = side === 1
    ? ['jugador1_origen_partido_id', 'partido_anterior_1_id', 'origen_partido_1_id', 'previous_match_1_id']
    : ['jugador2_origen_partido_id', 'partido_anterior_2_id', 'origen_partido_2_id', 'previous_match_2_id'];

  for (const field of fields) {
    const value = partido?.[field];
    if (value === null || value === undefined) continue;
    const safe = String(value).trim();
    if (safe) return safe;
  }

  return '';
};

const getWinnerOptions = (partido) => {
  const options = [
    {
      id: getJugadorId(partido, 1),
      name: getJugadorNombre(partido, 1),
    },
    {
      id: getJugadorId(partido, 2),
      name: getJugadorNombre(partido, 2),
    },
  ]
    .filter((item) => String(item.id || '').trim())
    .map((item) => ({
      id: String(item.id).trim(),
      name: item.name || 'Jugador',
    }));

  const dedup = [];
  const seen = new Set();
  options.forEach((item) => {
    if (seen.has(item.id)) return;
    seen.add(item.id);
    dedup.push(item);
  });

  return dedup;
};

const getPartidoLabel = (partido) => {
  return `${getJugadorNombre(partido, 1)} vs ${getJugadorNombre(partido, 2)}`;
};

const getMarcadorString = (partido) => String(partido?.marcador_en_vivo || partido?.score || partido?.resultado || partido?.marcador || '0-0').trim();

const isTechnicalLiveScore = (value) => {
  const text = String(value || '').trim().toUpperCase();
  if (!text) return false;

  const hasSet = /(^|\s)S\d+-\d+/.test(text);
  const hasGame = /(^|\s)G\d+-\d+/.test(text);
  const hasPointOrTb = /(^|\s)(P|TB)\d+-\d+/.test(text);
  return hasSet && hasGame && hasPointOrTb;
};

const normalizeFinalScoreInput = (value) => {
  return String(value || '')
    .trim()
    .replace(/\s*-\s*/g, '-')
    .replace(/\s*\/\s*/g, ' / ')
    .replace(/\s+/g, ' ');
};

const sanitizeFinalScoreText = (value) => {
  const text = normalizeFinalScoreInput(value);
  if (!text) return '';

  const normalized = text.toUpperCase();
  if (normalized === '0-0' || normalized === '-/-') return '';
  if (isTechnicalLiveScore(text)) return '';
  return text;
};

const isValidFinalScoreFormat = (value) => {
  const text = String(value || '').trim();
  if (!text) return false;
  return /^\d{1,2}-\d{1,2}(?:\s*\/\s*\d{1,2}-\d{1,2})*$/.test(text);
};

const getFinalScorePrefill = (partido, draftScore) => {
  const candidates = [
    partido?.resultado,
    partido?.marcador,
    draftScore,
    partido?.score,
    partido?.marcador_en_vivo,
  ];

  for (const candidate of candidates) {
    const clean = sanitizeFinalScoreText(candidate);
    if (clean) return clean;
  }

  return '';
};

const hasMeaningfulLiveEvidence = (partido) => {
  const marcador = getMarcadorString(partido);
  const normalizedScore = String(marcador || '').trim().toUpperCase();
  const defaultScores = new Set(['', '0-0', '-/-', 'S0-0 G0-0 P0-0', 'S0-0 G0-0 TB0-0']);
  if (!defaultScores.has(normalizedScore)) return true;
  if (String(partido?.inicio_real || '').trim()) return true;
  if (String(partido?.ultima_actualizacion || '').trim()) return true;
  return false;
};

const isGhostLiveMatch = (partido, pendingEntry) => {
  if (getPartidoEstadoKey(partido) !== 'en_juego') return false;
  if (pendingEntry?.startedExplicitly) return false;
  return !hasMeaningfulLiveEvidence(partido);
};

const TENNIS_POINT_LABELS = ['0', '15', '30', '40', 'AD'];

const createDefaultTennisState = () => ({
  setsA: 0,
  setsB: 0,
  gamesA: 0,
  gamesB: 0,
  pointsA: 0,
  pointsB: 0,
  tieBreak: false,
  tieBreakA: 0,
  tieBreakB: 0,
});

const clampNonNegativeInt = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.floor(parsed));
};

const parseTennisState = (scoreValue) => {
  const raw = String(scoreValue || '').trim();
  if (!raw) return createDefaultTennisState();

  const structured = raw.match(/^S(\d+)-(\d+)\s+G(\d+)-(\d+)\s+(?:P([0-9A-Z]+)-([0-9A-Z]+)|TB(\d+)-(\d+))$/i);
  if (structured) {
    const [, setsA, setsB, gamesA, gamesB, pA, pB, tbA, tbB] = structured;

    const state = {
      setsA: clampNonNegativeInt(setsA),
      setsB: clampNonNegativeInt(setsB),
      gamesA: clampNonNegativeInt(gamesA),
      gamesB: clampNonNegativeInt(gamesB),
      pointsA: 0,
      pointsB: 0,
      tieBreak: false,
      tieBreakA: 0,
      tieBreakB: 0,
    };

    if (tbA !== undefined && tbB !== undefined) {
      state.tieBreak = true;
      state.tieBreakA = clampNonNegativeInt(tbA);
      state.tieBreakB = clampNonNegativeInt(tbB);
      return state;
    }

    const idxA = TENNIS_POINT_LABELS.findIndex((label) => label === String(pA || '').toUpperCase());
    const idxB = TENNIS_POINT_LABELS.findIndex((label) => label === String(pB || '').toUpperCase());
    state.pointsA = idxA >= 0 ? idxA : 0;
    state.pointsB = idxB >= 0 ? idxB : 0;
    return state;
  }

  // Legacy fallback: treat "x-y" as current game count with points at 0-0.
  const legacy = raw.match(/(\d+)\s*[-:/]\s*(\d+)/);
  if (legacy) {
    const state = createDefaultTennisState();
    state.gamesA = clampNonNegativeInt(legacy[1]);
    state.gamesB = clampNonNegativeInt(legacy[2]);
    return state;
  }

  return createDefaultTennisState();
};

const serializeTennisState = (state) => {
  const sets = `S${clampNonNegativeInt(state.setsA)}-${clampNonNegativeInt(state.setsB)}`;
  const games = `G${clampNonNegativeInt(state.gamesA)}-${clampNonNegativeInt(state.gamesB)}`;

  if (state.tieBreak) {
    return `${sets} ${games} TB${clampNonNegativeInt(state.tieBreakA)}-${clampNonNegativeInt(state.tieBreakB)}`;
  }

  const pA = TENNIS_POINT_LABELS[clampNonNegativeInt(state.pointsA)] || '0';
  const pB = TENNIS_POINT_LABELS[clampNonNegativeInt(state.pointsB)] || '0';
  return `${sets} ${games} P${pA}-${pB}`;
};

const resolveSetWin = (state, winner) => {
  const next = { ...state };

  if (winner === 'A') next.gamesA += 1;
  if (winner === 'B') next.gamesB += 1;

  next.pointsA = 0;
  next.pointsB = 0;

  const diff = Math.abs(next.gamesA - next.gamesB);
  const maxGames = Math.max(next.gamesA, next.gamesB);

  if (maxGames >= 6 && diff >= 2) {
    if (next.gamesA > next.gamesB) next.setsA += 1;
    else next.setsB += 1;
    next.gamesA = 0;
    next.gamesB = 0;
    next.tieBreak = false;
    next.tieBreakA = 0;
    next.tieBreakB = 0;
    return next;
  }

  if (next.gamesA === 6 && next.gamesB === 6) {
    next.tieBreak = true;
    next.tieBreakA = 0;
    next.tieBreakB = 0;
  }

  return next;
};

const applyTennisPoint = (state, winner) => {
  const next = { ...state };

  if (next.tieBreak) {
    if (winner === 'A') next.tieBreakA += 1;
    if (winner === 'B') next.tieBreakB += 1;

    const diff = Math.abs(next.tieBreakA - next.tieBreakB);
    const maxTb = Math.max(next.tieBreakA, next.tieBreakB);
    if (maxTb >= 7 && diff >= 2) {
      if (next.tieBreakA > next.tieBreakB) next.setsA += 1;
      else next.setsB += 1;

      next.gamesA = 0;
      next.gamesB = 0;
      next.pointsA = 0;
      next.pointsB = 0;
      next.tieBreak = false;
      next.tieBreakA = 0;
      next.tieBreakB = 0;
    }

    return next;
  }

  const winnerPointKey = winner === 'A' ? 'pointsA' : 'pointsB';
  const loserPointKey = winner === 'A' ? 'pointsB' : 'pointsA';

  const winnerPoints = clampNonNegativeInt(next[winnerPointKey]);
  const loserPoints = clampNonNegativeInt(next[loserPointKey]);

  if (winnerPoints <= 2) {
    next[winnerPointKey] = winnerPoints + 1;
    return next;
  }

  if (winnerPoints === 3) {
    if (loserPoints <= 2) {
      return resolveSetWin(next, winner);
    }

    if (loserPoints === 3) {
      next[winnerPointKey] = 4;
      return next;
    }

    if (loserPoints >= 4) {
      next[loserPointKey] = 3;
      return next;
    }
  }

  if (winnerPoints >= 4) {
    return resolveSetWin(next, winner);
  }

  return next;
};

const formatElapsed = (inicioReal, nowMs) => {
  if (!inicioReal) return 'Sin iniciar';
  const inicioMs = new Date(inicioReal).getTime();
  if (!Number.isFinite(inicioMs)) return 'Sin iniciar';

  const diffSec = Math.max(0, Math.floor((nowMs - inicioMs) / 1000));
  const hours = Math.floor(diffSec / 3600);
  const minutes = Math.floor((diffSec % 3600) / 60);

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes} min`;
  return '< 1 min';
};

const sortBySchedule = (a, b) => {
  const primary = getDateMs(a?.fecha_hora) - getDateMs(b?.fecha_hora);
  if (primary !== 0) return primary;
  return Number(a?.id || 0) - Number(b?.id || 0);
};

const runFallbackRequest = async (requestFns) => {
  let lastError = null;

  for (const requestFn of requestFns) {
    try {
      return await requestFn();
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('No se pudo completar la solicitud.');
};

const formatScheduled = (value) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Horario a confirmar';
  return parsed.toLocaleString('es-AR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
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

const readMapForTorneo = (storageKey, torneoId) => {
  if (!torneoId) return {};
  const all = readScopedStorage(storageKey);
  const map = all?.[String(torneoId)];
  return map && typeof map === 'object' ? map : {};
};

const writeMapForTorneo = (storageKey, torneoId, map) => {
  if (!torneoId) return;
  const all = readScopedStorage(storageKey);
  const key = String(torneoId);
  const cleaned = map && typeof map === 'object' ? map : {};

  if (Object.keys(cleaned).length === 0) {
    if (Object.prototype.hasOwnProperty.call(all, key)) {
      const next = { ...all };
      delete next[key];
      writeScopedStorage(storageKey, next);
    }
    return;
  }

  writeScopedStorage(storageKey, {
    ...all,
    [key]: cleaned,
  });
};

const writePendingStartStorage = (value) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PENDING_START_STORAGE_KEY, JSON.stringify(value || {}));
  } catch (_) {
    // Ignore storage quota or serialization errors.
  }
};

const sanitizePendingMap = (map) => {
  const safe = map && typeof map === 'object' ? map : {};

  return Object.fromEntries(
    Object.entries(safe).filter(([id, value]) => {
      if (!String(id || '').trim()) return false;
      if (!value || typeof value !== 'object') return false;

      // Trust entries created by explicit start. Legacy entries are accepted only if they include a start timestamp.
      if (value?.startedExplicitly === true) return true;
      const inicioReal = String(value?.inicio_real || '').trim();
      return Boolean(inicioReal);
    })
  );
};

const readPendingStartForTorneo = (torneoId) => {
  if (!torneoId) return {};

  const all = readPendingStartStorage();
  const key = String(torneoId);
  const cleaned = sanitizePendingMap(all[key]);

  if (Object.keys(cleaned).length > 0) {
    if (JSON.stringify(cleaned) !== JSON.stringify(all[key] || {})) {
      writePendingStartStorage({
        ...all,
        [key]: cleaned,
      });
    }
    return cleaned;
  }

  if (Object.prototype.hasOwnProperty.call(all, key)) {
    const next = { ...all };
    delete next[key];
    writePendingStartStorage(next);
  }

  return {};
};

const writePendingStartForTorneo = (torneoId, map) => {
  if (!torneoId) return;

  const all = readPendingStartStorage();
  const key = String(torneoId);
  const cleaned = sanitizePendingMap(map);

  if (Object.keys(cleaned).length === 0) {
    if (Object.prototype.hasOwnProperty.call(all, key)) {
      const next = { ...all };
      delete next[key];
      writePendingStartStorage(next);
    }
    return;
  }

  writePendingStartStorage({
    ...all,
    [key]: cleaned,
  });
};

const broadcastLiveUpdate = ({ torneoId, partidoId, action }) => {
  if (typeof window === 'undefined') return;

  const payload = {
    torneoId: torneoId ? String(torneoId) : '',
    partidoId: partidoId ? String(partidoId) : '',
    action: action || 'updated',
    at: Date.now(),
  };

  try {
    window.localStorage.setItem(LIVE_UPDATE_STORAGE_KEY, JSON.stringify(payload));
  } catch (_) {
    // Ignore storage errors.
  }

  try {
    window.dispatchEvent(new CustomEvent(LIVE_UPDATE_EVENT, { detail: payload }));
  } catch (_) {
    // Ignore custom event errors.
  }
};

export default function AdminLiveControl({ torneos = [] }) {
  const { isAdmin } = useAuth();
  const canManageLive = Boolean(isAdmin);
  const [selectedTorneoId, setSelectedTorneoId] = useState('');
  const [canchas, setCanchas] = useState([]);
  const [partidos, setPartidos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState({ type: '', text: '' });
  const [busyByPartido, setBusyByPartido] = useState({});
  const [scoreDraftByPartido, setScoreDraftByPartido] = useState({});
  const [historyByPartido, setHistoryByPartido] = useState({});
  const [nextPartidoChoiceByCancha, setNextPartidoChoiceByCancha] = useState({});
  const [localFinalizedByPartido, setLocalFinalizedByPartido] = useState({});
  const [justFinishedByCancha, setJustFinishedByCancha] = useState({});
  const [pendingStartByPartido, setPendingStartByPartido] = useState({});
  const [confirmModal, setConfirmModal] = useState({ open: false, canchaKey: '', partido: null, score: '', ganadorId: '' });
  const [nowMs, setNowMs] = useState(Date.now());
  const [refreshTick, setRefreshTick] = useState(0);
  const finishTimeoutsRef = useRef({});
  const ghostRepairAttemptedRef = useRef({});
  const ghostWarningTimeoutRef = useRef(null);
  const selectedTorneoIdRef = useRef('');

  const torneosHoy = useMemo(() => {
    const all = Array.isArray(torneos) ? torneos : [];
    const filtered = all.filter((torneo) => isTorneoEnCurso(torneo) || isTodayDate(torneo?.fecha_inicio));
    return (filtered.length > 0 ? filtered : all)
      .slice()
      .sort((a, b) => new Date(a.fecha_inicio) - new Date(b.fecha_inicio));
  }, [torneos]);

  useEffect(() => {
    if (selectedTorneoId) return;
    if (torneosHoy.length === 0) return;
    setSelectedTorneoId(String(torneosHoy[0].id));
  }, [torneosHoy, selectedTorneoId]);

  useEffect(() => {
    selectedTorneoIdRef.current = selectedTorneoId;
  }, [selectedTorneoId]);

  useEffect(() => {
    const minuteInterval = setInterval(() => setNowMs(Date.now()), 60000);
    return () => clearInterval(minuteInterval);
  }, []);

  useEffect(() => {
    return () => {
      Object.values(finishTimeoutsRef.current).forEach((timeoutId) => clearTimeout(timeoutId));
      finishTimeoutsRef.current = {};
      if (ghostWarningTimeoutRef.current) {
        clearTimeout(ghostWarningTimeoutRef.current);
        ghostWarningTimeoutRef.current = null;
      }
    };
  }, []);

  const clearPendingStartKey = (partidoId, torneoIdArg = selectedTorneoIdRef.current) => {
    const key = String(partidoId || '');
    const torneoKey = String(torneoIdArg || '');
    if (!key || !torneoKey) return;

    if (torneoKey === String(selectedTorneoIdRef.current || '')) {
      setPendingStartByPartido((prev) => {
        if (!Object.prototype.hasOwnProperty.call(prev, key)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }

    const currentStored = readPendingStartForTorneo(torneoKey);
    if (Object.prototype.hasOwnProperty.call(currentStored, key)) {
      const nextStored = { ...currentStored };
      delete nextStored[key];
      writePendingStartForTorneo(torneoKey, nextStored);
    }
  };

  const markPendingStart = (partidoId, data, torneoIdArg = selectedTorneoIdRef.current) => {
    const key = String(partidoId || '');
    const torneoKey = String(torneoIdArg || '');
    if (!key || !torneoKey) return;

    if (torneoKey === String(selectedTorneoIdRef.current || '')) {
      setPendingStartByPartido((prev) => ({
        ...prev,
        [key]: {
          ...data,
          startedExplicitly: data?.startedExplicitly === true,
          persisted_at: Date.now(),
        },
      }));
    }

    const currentStored = readPendingStartForTorneo(torneoKey);
    writePendingStartForTorneo(torneoKey, {
      ...currentStored,
      [key]: {
        ...data,
        startedExplicitly: data?.startedExplicitly === true,
        persisted_at: Date.now(),
      },
    });
  };

  useEffect(() => {
    const torneoKey = String(selectedTorneoId || '');

    if (!torneoKey) {
      setPendingStartByPartido({});
      setNextPartidoChoiceByCancha({});
      setLocalFinalizedByPartido({});
      return;
    }

    const hydrated = readPendingStartForTorneo(torneoKey);
    setPendingStartByPartido(hydrated);
    setNextPartidoChoiceByCancha(readMapForTorneo(NEXT_CHOICE_STORAGE_KEY, torneoKey));
    setLocalFinalizedByPartido(readMapForTorneo(LOCAL_FINALIZED_STORAGE_KEY, torneoKey));
  }, [selectedTorneoId]);

  useEffect(() => {
    if (!selectedTorneoId) return;
    writePendingStartForTorneo(selectedTorneoId, pendingStartByPartido);
  }, [selectedTorneoId, pendingStartByPartido]);

  useEffect(() => {
    if (!selectedTorneoId) return;
    writeMapForTorneo(NEXT_CHOICE_STORAGE_KEY, selectedTorneoId, nextPartidoChoiceByCancha);
  }, [selectedTorneoId, nextPartidoChoiceByCancha]);

  useEffect(() => {
    if (!selectedTorneoId) return;
    writeMapForTorneo(LOCAL_FINALIZED_STORAGE_KEY, selectedTorneoId, localFinalizedByPartido);
  }, [selectedTorneoId, localFinalizedByPartido]);

  const fetchLiveData = async ({ silent = false } = {}) => {
    if (!selectedTorneoId) {
      setPartidos([]);
      setCanchas([]);
      return;
    }

    try {
      if (!silent) {
        setLoading(true);
        setError('');
      }

      const [cuadroRes, canchasRes] = await Promise.allSettled([
        axios.get(`${API_URL}/api/torneos/${selectedTorneoId}/cuadro`),
        axios.get(`${API_URL}/api/torneos/${selectedTorneoId}/canchas`),
      ]);

      const partidosLoaded = cuadroRes.status === 'fulfilled' ? extractPartidos(cuadroRes.value?.data) : [];
      const canchasLoaded = canchasRes.status === 'fulfilled' ? extractCanchas(canchasRes.value?.data) : [];
      const pendingSnapshot = readPendingStartForTorneo(selectedTorneoId);
      const ghostIds = [];

      const normalizedPartidos = partidosLoaded.map((partido) => {
        const partidoId = getPartidoIdCandidates(partido)[0] || '';
        const pending = partidoId ? pendingSnapshot[partidoId] : null;

        if (!isGhostLiveMatch(partido, pending)) return partido;
        if (partidoId) ghostIds.push(partidoId);

        return {
          ...partido,
          estado: 'programado',
          estado_partido: 'programado',
          __ghostLive: true,
        };
      });

      setPendingStartByPartido((prev) => {
        const entries = Object.entries(prev);
        if (entries.length === 0) return prev;

        let changed = false;
        const next = { ...prev };

        entries.forEach(([id]) => {
          if (ghostIds.includes(id)) {
            changed = true;
            delete next[id];
            return;
          }

          const matched = normalizedPartidos.find((partido) => getPartidoIdCandidates(partido).includes(id));
          if (!matched) return;

          const estadoKey = getPartidoEstadoKey(matched);
          if (estadoKey === 'finalizado') {
            changed = true;
            delete next[id];
          }
        });

        return changed ? next : prev;
      });

      if (ghostIds.length > 0) {
        const firstGhostLabel = ghostIds[0].slice(0, 8);
        if (!silent) {
          const ghostText = `${GHOST_WARNING_PREFIX} (P_${firstGhostLabel}...). Se restauraron a programado en este panel.`;
          setStatusMessage({
            type: 'error',
            text: ghostText,
          });

          if (ghostWarningTimeoutRef.current) {
            clearTimeout(ghostWarningTimeoutRef.current);
          }

          ghostWarningTimeoutRef.current = setTimeout(() => {
            setStatusMessage((prev) => {
              if (!String(prev?.text || '').startsWith(GHOST_WARNING_PREFIX)) return prev;
              return { type: '', text: '' };
            });
            ghostWarningTimeoutRef.current = null;
          }, GHOST_WARNING_HIDE_MS);
        }

        const repairs = normalizedPartidos
          .filter((partido) => {
            const partidoId = getPartidoIdCandidates(partido)[0] || '';
            if (!partidoId || !ghostIds.includes(partidoId)) return false;

            const key = `${selectedTorneoId}:${partidoId}`;
            if (ghostRepairAttemptedRef.current[key]) return false;
            ghostRepairAttemptedRef.current[key] = true;
            return true;
          })
          .map((partido) => {
            const payload = {
              estado: 'programado',
              estado_partido: 'programado',
              iniciar: false,
            };

            const requestFns = buildPartidoRequestFallbacks({
              partidoRef: partido,
              torneoId: selectedTorneoId,
              payload,
              suffixes: ['estado', ''],
            });

            return runFallbackRequest(requestFns).catch(() => null);
          });

        if (repairs.length > 0) {
          Promise.allSettled(repairs).then(() => {
            fetchLiveData({ silent: true });
          });
        }
      } else {
        setStatusMessage((prev) => {
          if (!String(prev?.text || '').startsWith(GHOST_WARNING_PREFIX)) return prev;
          return { type: '', text: '' };
        });

        if (ghostWarningTimeoutRef.current) {
          clearTimeout(ghostWarningTimeoutRef.current);
          ghostWarningTimeoutRef.current = null;
        }
      }

      setPartidos(normalizedPartidos);
      setCanchas(buildCanchaCatalog({ canchas: canchasLoaded, partidos: normalizedPartidos }));
    } catch (_) {
      if (!silent) setError('No se pudo cargar el panel de canchas en vivo.');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchLiveData();
  }, [selectedTorneoId]);

  useEffect(() => {
    if (!selectedTorneoId) return undefined;
    const pollingId = setInterval(() => {
      fetchLiveData({ silent: true });
      setRefreshTick((prev) => prev + 1);
    }, 8000);
    return () => clearInterval(pollingId);
  }, [selectedTorneoId]);

  const canchasCards = useMemo(() => {
    return canchas.map((cancha) => {
      const partidosCancha = partidos
        .filter((partido) => matchCancha(partido, cancha))
        .sort(sortBySchedule)
        .map((partido) => {
          if (partido?.__ghostLive) return partido;

          const partidoId = getPartidoIdCandidates(partido)[0] || '';
          const pending = partidoId ? pendingStartByPartido[partidoId] : null;
          if (!pending) return partido;
          if (getPartidoEstadoKey(partido) !== 'programado') return partido;

          const liveScore = pending?.score || getMarcadorString(partido) || '0-0';
          return {
            ...partido,
            estado: 'en_juego',
            inicio_real: partido?.inicio_real || pending.inicio_real,
            marcador_en_vivo: liveScore,
            score: liveScore,
            ultima_actualizacion: pending.ultima_actualizacion || partido?.ultima_actualizacion,
          };
        });

      const enJuego = partidosCancha.find((partido) => !partido?.__ghostLive && getPartidoEstadoKey(partido) === 'en_juego') || null;
      const enJuegoId = getPartidoIdCandidates(enJuego)[0] || '';

      const programadosBase = partidosCancha.filter((partido) => {
        if (partido?.__ghostLive) return false;
        if (getPartidoEstadoKey(partido) !== 'programado') return false;
        const partidoId = getPartidoIdCandidates(partido)[0] || '';
        if (enJuegoId && partidoId === enJuegoId) return false;
        return true;
      });

      const programados = programadosBase.filter((partido) => {
        const partidoId = getPartidoIdCandidates(partido)[0] || '';
        if (!partidoId) return false;
        return !localFinalizedByPartido[partidoId];
      });

      const programadosDisponibles = programados.length > 0 ? programados : programadosBase;
      const preferredId = String(nextPartidoChoiceByCancha[cancha.key] || '');
      const selectedProgramado = preferredId
        ? (programadosDisponibles.find((partido) => String(getPartidoIdCandidates(partido)[0] || '') === preferredId) || null)
        : null;

      const siguienteProgramado = selectedProgramado || programadosDisponibles[0] || null;
      const finalFlash = justFinishedByCancha[cancha.key] || null;

      if (enJuego) {
        return {
          cancha,
          state: 'en_juego',
          partido: enJuego,
          siguienteProgramado,
          programadosDisponibles,
          finalFlash: null,
        };
      }

      if (finalFlash && finalFlash.untilMs > nowMs) {
        return {
          cancha,
          state: 'finalizada',
          partido: null,
          siguienteProgramado,
          programadosDisponibles,
          finalFlash,
        };
      }

      return {
        cancha,
        state: 'vacia',
        partido: siguienteProgramado,
        siguienteProgramado,
        programadosDisponibles,
        finalFlash: null,
      };
    });
  }, [canchas, partidos, pendingStartByPartido, nextPartidoChoiceByCancha, localFinalizedByPartido, justFinishedByCancha, nowMs, refreshTick]);

  const resolvedPlayersByPartido = useMemo(() => {
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

    const resolved = {};
    const winnerByMatchId = {};

    const sortRoundMatches = (matches = []) => {
      return [...matches].sort((a, b) => {
        const byOrder = Number(a?.orden_en_ronda || a?.match_index || 0) - Number(b?.orden_en_ronda || b?.match_index || 0);
        if (byOrder !== 0) return byOrder;
        return String(getPartidoIdCandidates(a)[0] || '').localeCompare(String(getPartidoIdCandidates(b)[0] || ''));
      });
    };

    const resolveSide = (partido, side) => {
      const originId = getOrigenPartidoId(partido, side);
      if (originId) {
        const winner = winnerByMatchId[String(originId)];
        if (winner?.name) return { id: winner.id || '', name: winner.name };
        return { id: '', name: 'Por definir' };
      }

      return {
        id: getJugadorId(partido, side),
        name: getJugadorNombre(partido, side) || 'Por definir',
      };
    };

    roundOrders.forEach((roundOrder) => {
      const roundMatches = sortRoundMatches(byRound[roundOrder] || []);

      roundMatches.forEach((partido) => {
        const partidoId = String(getPartidoIdCandidates(partido)[0] || '').trim();
        if (!partidoId) return;

        const side1 = resolveSide(partido, 1);
        const side2 = resolveSide(partido, 2);

        resolved[partidoId] = {
          j1Name: side1.name,
          j2Name: side2.name,
        };

        const winnerId = String(partido?.ganador_id || '').trim();
        if (!winnerId) return;

        const winnerName = winnerId === String(side1.id || '').trim()
          ? side1.name
          : winnerId === String(side2.id || '').trim()
            ? side2.name
            : '';

        winnerByMatchId[partidoId] = {
          id: winnerId,
          name: winnerName || 'Por definir',
        };
      });
    });

    return resolved;
  }, [partidos]);

  const getDisplayPlayerName = (partido, side) => {
    const partidoId = String(getPartidoIdCandidates(partido)[0] || '').trim();
    const resolved = partidoId ? resolvedPlayersByPartido[partidoId] : null;
    if (resolved) {
      if (side === 1) return resolved.j1Name || 'Por definir';
      if (side === 2) return resolved.j2Name || 'Por definir';
    }
    return getJugadorNombre(partido, side) || 'Por definir';
  };

  const getDisplayPartidoLabel = (partido) => `${getDisplayPlayerName(partido, 1)} vs ${getDisplayPlayerName(partido, 2)}`;

  const ensureCanManageLive = () => {
    if (canManageLive) return true;
    setStatusMessage({
      type: 'error',
      text: 'Solo administradores pueden controlar el marcador en vivo.',
    });
    return false;
  };

  const updatePartidoLocal = (partidoId, patch) => {
    const targetIds = getPartidoIdCandidates(partidoId);
    setPartidos((prev) => prev.map((partido) => {
      const partidoIds = getPartidoIdCandidates(partido);
      const match = partidoIds.some((id) => targetIds.includes(id));
      return match ? { ...partido, ...patch } : partido;
    }));
  };

  const setBusyPartido = (partidoId, value) => {
    const key = String(partidoId || '');
    if (!key) return;
    setBusyByPartido((prev) => ({ ...prev, [key]: value }));
  };

  const getDraftScore = (partido) => {
    const key = getPartidoIdCandidates(partido)[0] || '';
    if (!key) return '0-0';
    if (Object.prototype.hasOwnProperty.call(scoreDraftByPartido, key)) {
      return scoreDraftByPartido[key];
    }
    return getMarcadorString(partido) || '0-0';
  };

  const setDraftScore = (partidoId, value) => {
    const key = getPartidoIdCandidates(partidoId)[0] || '';
    if (!key) return;
    setScoreDraftByPartido((prev) => ({ ...prev, [key]: value }));
  };

  const pushPointHistory = (partidoId, previousScore) => {
    const key = getPartidoIdCandidates(partidoId)[0] || '';
    if (!key) return;

    setHistoryByPartido((prev) => {
      const current = Array.isArray(prev[key]) ? prev[key] : [];
      const nextStack = [...current, String(previousScore || 'S0-0 G0-0 P0-0')].slice(-30);
      return {
        ...prev,
        [key]: nextStack,
      };
    });
  };

  const popPointHistory = (partidoId) => {
    const key = getPartidoIdCandidates(partidoId)[0] || '';
    if (!key) return null;

    let restored = null;
    setHistoryByPartido((prev) => {
      const current = Array.isArray(prev[key]) ? prev[key] : [];
      if (current.length === 0) return prev;

      const next = [...current];
      restored = next.pop() || null;

      if (next.length === 0) {
        const without = { ...prev };
        delete without[key];
        return without;
      }

      return {
        ...prev,
        [key]: next,
      };
    });

    return restored;
  };

  const persistScore = async (partido, scoreValue) => {
    if (!ensureCanManageLive()) return false;

    const partidoId = getPartidoIdCandidates(partido)[0];
    if (!partidoId) return false;

    const score = String(scoreValue || '').trim();
    if (!score) return false;

    setBusyPartido(partidoId, true);

    const nowIso = new Date().toISOString();
    const payload = {
      marcador_en_vivo: score,
      score,
      resultado: score,
      estado: 'en_juego',
      estado_partido: 'en_juego',
      ultima_actualizacion: nowIso,
      parcial: true,
    };

    try {
      const requestFns = buildPartidoRequestFallbacks({
        partidoRef: partido,
        torneoId: selectedTorneoId,
        payload,
        suffixes: ['marcador', 'marcador-en-vivo', ''],
      });
      await runFallbackRequest(requestFns);

      updatePartidoLocal(partidoId, payload);

      const existingPending = pendingStartByPartido[String(partidoId)] || readPendingStartForTorneo(selectedTorneoId)?.[String(partidoId)];
      if (existingPending?.startedExplicitly) {
        markPendingStart(partidoId, {
          inicio_real: partido?.inicio_real || existingPending?.inicio_real || nowIso,
          score,
          ultima_actualizacion: nowIso,
          startedExplicitly: true,
        }, selectedTorneoId);
      }

      broadcastLiveUpdate({ torneoId: selectedTorneoId, partidoId, action: 'score' });
      setStatusMessage({
        type: 'success',
        text: `Marcador actualizado: ${getPartidoLabel(partido)} (${score}).`,
      });
      return true;
    } catch (err) {
      setStatusMessage({ type: 'error', text: err?.response?.data?.error || 'No se pudo actualizar el marcador.' });
      return false;
    } finally {
      setBusyPartido(partidoId, false);
    }
  };

  const handleAddPoint = async (partido, winner) => {
    if (!ensureCanManageLive()) return;

    const partidoId = getPartidoIdCandidates(partido)[0];
    if (!partidoId) return;

    const previousScore = getDraftScore(partido);
    const currentState = parseTennisState(previousScore);
    const nextState = applyTennisPoint(currentState, winner);
    const nextScore = serializeTennisState(nextState);

    pushPointHistory(partidoId, previousScore);
    setDraftScore(partidoId, nextScore);

    await persistScore(partido, nextScore);
  };

  const handleUndoPoint = async (partido) => {
    if (!ensureCanManageLive()) return;

    const partidoId = getPartidoIdCandidates(partido)[0];
    if (!partidoId) return;

    const restoredScore = popPointHistory(partidoId);
    if (!restoredScore) {
      setStatusMessage({ type: 'error', text: 'No hay puntos para deshacer en este partido.' });
      return;
    }

    setDraftScore(partidoId, restoredScore);
    await persistScore(partido, restoredScore);
  };

  const handleSaveScore = async (partido) => {
    if (!ensureCanManageLive()) return;

    const partidoId = getPartidoIdCandidates(partido)[0];
    if (!partidoId) return;

    const normalized = serializeTennisState(parseTennisState(getDraftScore(partido)));
    setDraftScore(partidoId, normalized);
    await persistScore(partido, normalized);
  };

  const handleStartNext = async (canchaCard) => {
    if (!ensureCanManageLive()) return;

    const partido = canchaCard?.siguienteProgramado;
    const partidoId = getPartidoIdCandidates(partido)[0];
    if (!partidoId) return;

    setBusyPartido(partidoId, true);

    const nowIso = new Date().toISOString();
    const score = getDraftScore(partido) || '0-0';
    const payload = {
      estado: 'en_juego',
      estado_partido: 'en_juego',
      inicio_real: partido?.inicio_real || nowIso,
      ultima_actualizacion: nowIso,
      marcador_en_vivo: score,
      score,
      iniciar: true,
    };

    try {
      const requestFns = buildPartidoRequestFallbacks({
        partidoRef: partido,
        torneoId: selectedTorneoId,
        payload,
        suffixes: ['iniciar', 'estado', ''],
      });
      await runFallbackRequest(requestFns);

      updatePartidoLocal(partidoId, payload);
      markPendingStart(partidoId, {
        inicio_real: payload.inicio_real,
        score,
        ultima_actualizacion: nowIso,
        startedExplicitly: true,
      }, selectedTorneoId);
      setNextPartidoChoiceByCancha((prev) => {
        const next = { ...prev };
        delete next[canchaCard.cancha.key];
        return next;
      });
      broadcastLiveUpdate({ torneoId: selectedTorneoId, partidoId, action: 'start' });
      setStatusMessage({
        type: 'success',
        text: `${getPartidoLabel(partido)} iniciado en ${canchaCard.cancha.nombre}.`,
      });
      fetchLiveData({ silent: true });
    } catch (err) {
      setStatusMessage({ type: 'error', text: err?.response?.data?.error || 'No se pudo iniciar el siguiente partido.' });
    } finally {
      setBusyPartido(partidoId, false);
    }
  };

  const openFinalizeModal = (canchaKey, partido) => {
    if (!ensureCanManageLive()) return;
    if (getPartidoIdCandidates(partido).length === 0) return;
    const winnerOptions = getWinnerOptions(partido);
    const defaultWinnerId = String(partido?.ganador_id || winnerOptions[0]?.id || '').trim();
    const draftScore = getDraftScore(partido);
    setConfirmModal({
      open: true,
      canchaKey,
      partido,
      score: getFinalScorePrefill(partido, draftScore),
      ganadorId: defaultWinnerId,
    });
  };

  const closeFinalizeModal = () => {
    setConfirmModal({ open: false, canchaKey: '', partido: null, score: '', ganadorId: '' });
  };

  const handleFinalize = async () => {
    if (!ensureCanManageLive()) return;

    const partido = confirmModal.partido;
    const canchaKey = confirmModal.canchaKey;
    const partidoId = getPartidoIdCandidates(partido)[0];
    if (!partidoId || !canchaKey) return;

    const score = sanitizeFinalScoreText(confirmModal.score);
    const winnerOptions = getWinnerOptions(partido);
    const winnerRaw = String(confirmModal.ganadorId || '').trim();
    if (!score) {
      setStatusMessage({ type: 'error', text: 'Ingresa el marcador final antes de finalizar.' });
      return;
    }

    if (!isValidFinalScoreFormat(score)) {
      setStatusMessage({ type: 'error', text: 'Usa formato de sets. Ejemplo: 6-4 / 6-4.' });
      return;
    }

    if (winnerOptions.length > 0 && !winnerRaw) {
      setStatusMessage({ type: 'error', text: 'Selecciona el ganador para actualizar correctamente la siguiente ronda.' });
      return;
    }

    setBusyPartido(partidoId, true);

    const nowIso = new Date().toISOString();
    const payload = {
      estado: 'finalizado',
      estado_partido: 'finalizado',
      marcador_en_vivo: score,
      score,
      resultado: score,
      ultima_actualizacion: nowIso,
      finalizar: true,
    };

    if (winnerRaw) {
      payload.ganador_id = /^\d+$/.test(winnerRaw) ? Number(winnerRaw) : winnerRaw;
    }

    try {
      const requestFns = buildPartidoRequestFallbacks({
        partidoRef: partido,
        torneoId: selectedTorneoId,
        payload,
        suffixes: ['finalizar', 'resultado', ''],
      });
      await runFallbackRequest(requestFns);

      updatePartidoLocal(partidoId, payload);
      clearPendingStartKey(partidoId, selectedTorneoId);
      setLocalFinalizedByPartido((prev) => ({
        ...prev,
        [partidoId]: Date.now(),
      }));
      setNextPartidoChoiceByCancha((prev) => {
        const next = { ...prev };
        delete next[canchaKey];
        return next;
      });
      broadcastLiveUpdate({ torneoId: selectedTorneoId, partidoId, action: 'finish' });
      setStatusMessage({
        type: 'success',
        text: `${getPartidoLabel(partido)} finalizado (${score}). Cuadro actualizado.`,
      });

      const flashPayload = {
        untilMs: Date.now() + FINAL_FLASH_MS,
        resultado: score,
        partidoId,
        jugadorA: getJugadorNombre(partido, 1),
        jugadorB: getJugadorNombre(partido, 2),
      };

      setJustFinishedByCancha((prev) => ({ ...prev, [canchaKey]: flashPayload }));
      if (finishTimeoutsRef.current[canchaKey]) {
        clearTimeout(finishTimeoutsRef.current[canchaKey]);
      }
      finishTimeoutsRef.current[canchaKey] = setTimeout(() => {
        setJustFinishedByCancha((prev) => {
          const next = { ...prev };
          delete next[canchaKey];
          return next;
        });
      }, FINAL_FLASH_MS);

      closeFinalizeModal();
    } catch (err) {
      setStatusMessage({ type: 'error', text: err?.response?.data?.error || 'No se pudo finalizar el partido.' });
    } finally {
      setBusyPartido(partidoId, false);
    }
  };

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-4 sm:p-6 border-b border-gray-100 bg-gradient-to-r from-slate-50 to-white">
        <h2 className="text-xl sm:text-2xl font-black text-gray-900">Panel de Control de Canchas en Vivo</h2>
        <p className="text-sm text-gray-500 mt-1">Control mobile-first para iniciar partidos, actualizar marcador y finalizar en tiempo real.</p>

        {!canManageLive && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700">
            Modo solo lectura: los controles de puntaje estan disponibles solo para administradores.
          </div>
        )}

        <div className="mt-4 max-w-md">
          <label className="block text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">Torneo de hoy</label>
          <select
            value={selectedTorneoId}
            onChange={(event) => setSelectedTorneoId(event.target.value)}
            className="w-full rounded-xl border border-gray-300 px-3 py-3 text-sm font-semibold"
          >
            <option value="" disabled>Selecciona torneo...</option>
            {torneosHoy.map((torneo) => (
              <option key={torneo.id} value={torneo.id}>
                {torneo.titulo}
              </option>
            ))}
          </select>
        </div>

        {statusMessage.text && (
          <div className={`mt-4 rounded-lg px-3 py-2 text-sm font-semibold border ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}>
            {statusMessage.text}
          </div>
        )}
      </div>

      <div className="p-4 sm:p-6">
        {loading ? (
          <div className="py-10 flex justify-center">
            <div className="h-9 w-9 rounded-full border-b-2 border-blue-600 animate-spin" />
          </div>
        ) : error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 px-3 py-2 text-sm font-medium">
            {error}
          </div>
        ) : canchasCards.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-500 text-center">
            No hay canchas asignadas al torneo seleccionado.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
            {canchasCards.map((card) => {
              const { cancha, state, partido, finalFlash, programadosDisponibles = [] } = card;
              const canchaHeader = `${cancha.nombre}${cancha.tipo_superficie ? ` - ${cancha.tipo_superficie}` : ''}`;
              const tennisState = parseTennisState(partido ? getDraftScore(partido) : '');
              const pointLabelA = tennisState.tieBreak
                ? String(tennisState.tieBreakA)
                : (TENNIS_POINT_LABELS[tennisState.pointsA] || '0');
              const pointLabelB = tennisState.tieBreak
                ? String(tennisState.tieBreakB)
                : (TENNIS_POINT_LABELS[tennisState.pointsB] || '0');
              const partidoKey = getPartidoIdCandidates(partido)[0] || '';
              const busy = Boolean(partidoKey && busyByPartido[String(partidoKey)]);

              return (
                <article key={cancha.key} className="rounded-2xl border border-gray-200 bg-white shadow-sm p-4 sm:p-5 space-y-4">
                  <header className="space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-base sm:text-lg font-black text-gray-900">{canchaHeader}</h3>
                      {selectedTorneoId && torneosHoy.find((t) => String(t.id) === selectedTorneoId)?.titulo ? (
                        <span className="shrink-0 inline-flex items-center rounded-full bg-indigo-100 text-indigo-700 px-2 py-0.5 text-[10px] font-bold leading-none">
                          {torneosHoy.find((t) => String(t.id) === selectedTorneoId).titulo}
                        </span>
                      ) : null}
                    </div>
                    <p className={`text-xs font-bold ${
                      state === 'en_juego'
                        ? 'text-emerald-600'
                        : state === 'finalizada'
                          ? 'text-blue-600'
                          : 'text-gray-500'
                    }`}>
                      Estado: {state === 'en_juego' ? 'En Juego' : state === 'finalizada' ? 'Finalizada' : 'Vacia'} {state === 'en_juego' ? '🟢' : ''}
                    </p>
                  </header>

                  {state === 'vacia' && (
                    <div className="space-y-3">
                      {programadosDisponibles.length > 0 && (
                        <div>
                          <label className="block text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-1.5">
                            Elegir siguiente partido
                          </label>
                          <select
                            value={String(nextPartidoChoiceByCancha[cancha.key] || getPartidoIdCandidates(partido)[0] || '')}
                            onChange={(event) => {
                              const value = event.target.value;
                              setNextPartidoChoiceByCancha((prev) => ({
                                ...prev,
                                [cancha.key]: value,
                              }));
                            }}
                            className="w-full rounded-lg border border-gray-300 px-2.5 py-2 text-xs font-semibold text-gray-700"
                          >
                            {programadosDisponibles.map((item) => {
                              const itemId = String(getPartidoIdCandidates(item)[0] || '');
                              const label = `${getDisplayPartidoLabel(item)} - ${formatScheduled(item?.fecha_hora)}`;
                              return (
                                <option key={`next-${cancha.key}-${itemId}`} value={itemId}>
                                  {label}
                                </option>
                              );
                            })}
                          </select>
                        </div>
                      )}

                      {partido ? (
                        <>
                          <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                            <p className="font-semibold">Siguiente:</p>
                            <p className="text-xs mt-1">{getDisplayPartidoLabel(partido)}</p>
                            <p className="text-xs text-gray-500 mt-1">{formatScheduled(partido?.fecha_hora)}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleStartNext(card)}
                            disabled={busy || !canManageLive}
                            className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm py-3 disabled:opacity-60"
                          >
                            {busy ? 'Iniciando...' : 'Iniciar Siguiente Partido'}
                          </button>
                        </>
                      ) : (
                        <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-4 text-sm text-gray-500 text-center">
                          Sin partidos programados para esta cancha.
                        </div>
                      )}
                    </div>
                  )}

                  {state === 'en_juego' && partido && (
                    <div className="space-y-3">
                      <div className="text-xs text-gray-500 font-semibold">
                        {getDisplayPartidoLabel(partido)}
                      </div>
                      <div className="text-xs font-bold text-gray-500">
                        Tiempo transcurrido: <span className="text-gray-700">{formatElapsed(partido?.inicio_real, nowMs)}</span>
                      </div>

                      <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 flex flex-wrap gap-3">
                        <span>Sets: {tennisState.setsA}-{tennisState.setsB}</span>
                        <span>Games: {tennisState.gamesA}-{tennisState.gamesB}</span>
                        <span>{tennisState.tieBreak ? 'Tie-break activo' : 'Puntos del game'}</span>
                      </div>

                      <div className="space-y-2">
                        <div className="rounded-xl border border-gray-100 bg-gray-50 p-2.5 flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-gray-700 break-words leading-snug">{getDisplayPlayerName(partido, 1)}</span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleUndoPoint(partido)}
                              disabled={busy || !canManageLive}
                              className="h-9 w-9 rounded-lg border border-gray-300 text-gray-700 font-black text-lg disabled:opacity-60"
                            >
                              -
                            </button>
                            <span className="min-w-8 text-center text-lg font-black text-gray-900">{pointLabelA}</span>
                            <button
                              type="button"
                              onClick={() => handleAddPoint(partido, 'A')}
                              disabled={busy || !canManageLive}
                              className="h-9 w-9 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-700 font-black text-lg disabled:opacity-60"
                            >
                              +
                            </button>
                          </div>
                        </div>

                        <div className="rounded-xl border border-gray-100 bg-gray-50 p-2.5 flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-gray-700 break-words leading-snug">{getDisplayPlayerName(partido, 2)}</span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleUndoPoint(partido)}
                              disabled={busy || !canManageLive}
                              className="h-9 w-9 rounded-lg border border-gray-300 text-gray-700 font-black text-lg disabled:opacity-60"
                            >
                              -
                            </button>
                            <span className="min-w-8 text-center text-lg font-black text-gray-900">{pointLabelB}</span>
                            <button
                              type="button"
                              onClick={() => handleAddPoint(partido, 'B')}
                              disabled={busy || !canManageLive}
                              className="h-9 w-9 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-700 font-black text-lg disabled:opacity-60"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={getDraftScore(partido)}
                          onChange={(event) => setDraftScore(partidoKey, event.target.value)}
                          placeholder="Ej: S0-0 G4-4 P40-30"
                          disabled={!canManageLive}
                          className="flex-1 rounded-lg border border-amber-300 px-3 py-2 text-sm font-semibold"
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveScore(partido)}
                          disabled={busy || !canManageLive}
                          className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700 disabled:opacity-60"
                        >
                          Guardar
                        </button>
                      </div>

                      <footer>
                        <button
                          type="button"
                          onClick={() => openFinalizeModal(cancha.key, partido)}
                          disabled={busy || !canManageLive}
                          className="w-full rounded-xl bg-gray-900 hover:bg-black text-white font-bold text-sm py-3 disabled:opacity-60"
                        >
                          Finalizar y avanzar cuadro
                        </button>
                      </footer>
                    </div>
                  )}

                  {state === 'finalizada' && finalFlash && (
                    <div className="space-y-3">
                      <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-3">
                        <p className="text-xs font-bold text-blue-700">Resultado reciente</p>
                        <p className="text-sm font-semibold text-gray-700 mt-1">{finalFlash.jugadorA} vs {finalFlash.jugadorB}</p>
                        <p className="text-lg font-black text-blue-700 mt-1">{finalFlash.resultado}</p>
                      </div>
                      <p className="text-xs text-gray-500">En breve quedara disponible para iniciar el siguiente partido.</p>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>

      {confirmModal.open && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-xl p-5 space-y-4">
            <h4 className="text-lg font-black text-gray-900">Confirmar finalizacion</h4>
            <p className="text-sm text-gray-600">Este resultado se enviara al backend para cerrar el partido y avanzar el cuadro.</p>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">Resultado final</label>
              <input
                type="text"
                value={confirmModal.score}
                onChange={(event) => setConfirmModal((prev) => ({ ...prev, score: event.target.value }))}
                onBlur={(event) => {
                  const normalized = normalizeFinalScoreInput(event.target.value);
                  setConfirmModal((prev) => ({ ...prev, score: normalized }));
                }}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold"
                placeholder="Ej: 6-4 / 6-4"
              />
              <p className="mt-1 text-[11px] text-gray-500">Formato recomendado: set-set / set-set (ej: 6-4 / 6-4).</p>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">Ganador</label>
              <select
                value={confirmModal.ganadorId}
                onChange={(event) => setConfirmModal((prev) => ({ ...prev, ganadorId: event.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold"
              >
                <option value="">Seleccionar...</option>
                {getWinnerOptions(confirmModal.partido).map((option) => (
                  <option key={`confirm-winner-${option.id}`} value={option.id}>{option.name}</option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={closeFinalizeModal}
                className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleFinalize}
                disabled={!canManageLive}
                className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-bold hover:bg-black"
              >
                Confirmar final
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
