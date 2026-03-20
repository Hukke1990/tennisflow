/* eslint-disable react/prop-types */
import React from 'react';
const normalizeText = (value) => String(value || '').toLowerCase().trim();
const normalizeCanchaName = (value) => normalizeText(value).replace(/\s+/g, ' ');

const getCanchaInfoFromPartido = (partido) => ({
  id: partido?.cancha_id ?? partido?.cancha?.id ?? null,
  nombre: partido?.cancha?.nombre || partido?.cancha_nombre || partido?.cancha || '',
});

const isPartidoEnJuego = (partido) => {
  const estado = normalizeText(partido?.estado);
  const isLiveState = estado.includes('juego') || estado.includes('curso') || estado.includes('live');
  if (!isLiveState) return false;

  const rawScore = String(partido?.marcador_en_vivo || partido?.score || partido?.resultado || partido?.marcador || '').trim().toUpperCase();
  const defaultScores = new Set(['', '0-0', '-/-', 'S0-0 G0-0 P0-0', 'S0-0 G0-0 TB0-0']);

  if (String(partido?.inicio_real || '').trim()) return true;
  if (String(partido?.ultima_actualizacion || '').trim()) return true;
  if (!defaultScores.has(rawScore)) return true;

  return false;
};

const matchCancha = (partido, cancha) => {
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
};

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

const getPartidoEnJuegoPorCancha = (partidos, cancha) => {
  const enJuego = partidos
    .filter((partido) => matchCancha(partido, cancha))
    .filter(isPartidoEnJuego)
    .sort((a, b) => {
      const timeA = getDateMs(a?.ultima_actualizacion, getDateMs(a?.inicio_real, getDateMs(a?.fecha_hora, 0)));
      const timeB = getDateMs(b?.ultima_actualizacion, getDateMs(b?.inicio_real, getDateMs(b?.fecha_hora, 0)));
      return timeB - timeA;
    });

  return enJuego[0] || null;
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
    };
  }

  const [, setsA, setsB, gamesA, gamesB, pA, pB, tbA, tbB] = structured;

  if (tbA !== undefined && tbB !== undefined) {
    return {
      main: `TB ${tbA}-${tbB}`,
      detail: `Sets ${setsA}-${setsB} · Games ${gamesA}-${gamesB}`,
    };
  }

  return {
    main: `${pA}-${pB}`,
    detail: `Sets ${setsA}-${setsB} · Games ${gamesA}-${gamesB}`,
  };
};

const formatTiempoTranscurrido = (inicioReal, nowMs) => {
  if (!inicioReal) return 'Sin iniciar';
  const inicioMs = new Date(inicioReal).getTime();
  if (!Number.isFinite(inicioMs)) return 'Sin iniciar';

  const diffSec = Math.max(0, Math.floor((nowMs - inicioMs) / 1000));
  const hours = Math.floor(diffSec / 3600);
  const minutes = Math.floor((diffSec % 3600) / 60);

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return 'menos de 1m';
};

export default function LiveMatchGrid({ liveCenter, nowMs }) {
  const torneo = liveCenter?.torneo;
  const canchas = Array.isArray(liveCenter?.canchas) ? liveCenter.canchas : [];
  const partidos = Array.isArray(liveCenter?.partidos) ? liveCenter.partidos : [];
  const hasLiveMatches = Boolean(liveCenter?.hasLiveMatches);

  if (!hasLiveMatches) return null;

  return (
    <section className="rounded-2xl border border-red-100 bg-gradient-to-br from-red-50 via-white to-orange-50 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-red-100/80 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-black text-red-700 text-lg">
          {torneo ? `Torneo en curso: ${torneo.titulo}` : 'Canchas en Vivo'}
        </h2>
          <p className="text-xs text-red-500">Estado de canchas en vivo</p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-white px-3 py-1 text-[11px] font-bold text-red-600">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          EN VIVO
        </span>
      </div>

      {canchas.length === 0 ? (
        <p className="px-5 py-8 text-sm text-gray-500">No hay canchas asignadas para mostrar en este torneo.</p>
      ) : (
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {canchas.map((cancha) => {
            const partidoEnJuego = getPartidoEnJuegoPorCancha(partidos, cancha);
            return (
              <MatchCanchaCard
                key={cancha.key}
                cancha={cancha}
                partidoEnJuego={partidoEnJuego}
                nowMs={nowMs}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

// ── MatchCanchaCard ───────────────────────────────────────────────────────────
// Memoizado: sólo se re-renderiza cuando cambia el marcador del partido
// de ESA cancha, o 'nowMs'. El Header y otras tarjetas no se repintan.
const MatchCanchaCard = React.memo(function MatchCanchaCard({ cancha, partidoEnJuego, nowMs }) {
  const marcador = partidoEnJuego ? getMarcadorLegible(partidoEnJuego) : null;
  const jugadorA = partidoEnJuego ? splitTeamLines(getJugadorPartido(partidoEnJuego, 1)) : { line1: '', line2: '' };
  const jugadorB = partidoEnJuego ? splitTeamLines(getJugadorPartido(partidoEnJuego, 2)) : { line1: '', line2: '' };

  return (
    <article className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="font-black text-gray-800">{cancha.nombre}</p>
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          {partidoEnJuego?.__torneo_nombre ? (
            <span className="inline-flex items-center rounded-full bg-indigo-100 text-indigo-700 px-2 py-0.5 text-[10px] font-bold">
              {partidoEnJuego.__torneo_nombre}
            </span>
          ) : null}
          {partidoEnJuego ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-600 px-2.5 py-1 text-[11px] font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              EN VIVO
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-gray-100 text-gray-500 px-2.5 py-1 text-[11px] font-bold">
              SIN PARTIDO EN VIVO
            </span>
          )}
        </div>
      </div>

      {partidoEnJuego ? (
        <div className="space-y-2">
          <div className="text-sm text-gray-700 font-semibold leading-snug">
            <p>{jugadorA.line1}</p>
            {jugadorA.line2 ? <p className="text-xs text-gray-500 font-semibold">{jugadorA.line2}</p> : null}
          </div>
          <p className="text-xs font-bold uppercase tracking-wide text-gray-400">vs</p>
          <div className="text-sm text-gray-700 font-semibold leading-snug">
            <p>{jugadorB.line1}</p>
            {jugadorB.line2 ? <p className="text-xs text-gray-500 font-semibold">{jugadorB.line2}</p> : null}
          </div>
          <p className="text-3xl font-black text-red-600 tracking-tight animate-pulse">{marcador?.main || getMarcadorEnVivo(partidoEnJuego)}</p>
          {marcador?.detail && (
            <p className="text-xs text-gray-500 font-semibold">{marcador.detail}</p>
          )}
          <p className="text-xs text-gray-500">
            Tiempo transcurrido: <span className="font-bold text-gray-700">{formatTiempoTranscurrido(partidoEnJuego?.inicio_real, nowMs)}</span>
          </p>
        </div>
      ) : (
        <p className="text-sm text-gray-500">Esta cancha no tiene un partido activo en este momento.</p>
      )}
    </article>
  );
}, (prevProps, nextProps) => {
  // Solo re-renderizar si cambia el marcador del partido de esta cancha
  // o si cambia el nowMs (tiempo transcurrido, cada 60s)
  const prevScore = prevProps.partidoEnJuego?.marcador_en_vivo ?? prevProps.partidoEnJuego?.score ?? '';
  const nextScore = nextProps.partidoEnJuego?.marcador_en_vivo ?? nextProps.partidoEnJuego?.score ?? '';
  const prevId = prevProps.partidoEnJuego?.id ?? null;
  const nextId = nextProps.partidoEnJuego?.id ?? null;
  return prevScore === nextScore && prevId === nextId && prevProps.nowMs === nextProps.nowMs;
});
