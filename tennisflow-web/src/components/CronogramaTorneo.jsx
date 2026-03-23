/* eslint-disable react/prop-types */
import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  Clock, MapPin, Play, Check, Plus, RefreshCcw, X,
  ChevronLeft, ChevronRight, AlertTriangle, FileText,
} from 'lucide-react';

const DAY_OPTIONS = [
  { key: 'viernes', label: 'Viernes', weekday: 5 },
  { key: 'sabado', label: 'Sabado', weekday: 6 },
  { key: 'domingo', label: 'Domingo', weekday: 0 },
];

const BASE_SLOTS = ['09:00', '10:30', '12:00', '13:30', '15:00', '16:30', '18:00', '19:30'];

const DAY_BY_WEEKDAY = DAY_OPTIONS.reduce((acc, day) => {
  acc[day.weekday] = day.key;
  return acc;
}, {});

const normalizeText = (value) => String(value || '').toLowerCase();
const normalizeCanchaName = (value) => normalizeText(value).replace(/\s+/g, ' ').trim();
const hasValue = (value) => value !== null && value !== undefined && value !== '';
const getFirstNonEmpty = (values = []) => {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const safe = String(value).trim();
    if (safe) return safe;
  }
  return '';
};

const toMinutes = (timeValue) => {
  const [hours, minutes] = String(timeValue || '00:00').split(':').map(Number);
  return (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0);
};

const hasMeaningfulLiveEvidence = (partido) => {
  const rawScore = String(partido?.marcador_en_vivo || partido?.score || partido?.resultado || partido?.marcador || '').trim().toUpperCase();
  const defaultScores = new Set(['', '0-0', '-/-', 'S0-0 G0-0 P0-0', 'S0-0 G0-0 TB0-0']);

  if (String(partido?.inicio_real || '').trim()) return true;
  if (String(partido?.ultima_actualizacion || '').trim()) return true;
  if (!defaultScores.has(rawScore)) return true;

  return false;
};

const getPartidoEstado = (partido) => {
  const estado = normalizeText(partido?.estado);

  if (estado.includes('final') || estado.includes('complet') || estado.includes('termin')) {
    return { key: 'finalizado', label: 'Finalizado', badge: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
  }

  if ((estado.includes('juego') || estado.includes('curso') || estado.includes('playing') || estado.includes('live')) && hasMeaningfulLiveEvidence(partido)) {
    return { key: 'en_juego', label: 'En Juego', badge: 'bg-amber-100 text-amber-700 border-amber-200' };
  }

  if (partido?.ganador_id) {
    return { key: 'finalizado', label: 'Finalizado', badge: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
  }

  return { key: 'programado', label: 'Programado', badge: 'bg-blue-100 text-blue-700 border-blue-200' };
};

const getDayKeyFromDate = (dateValue) => {
  if (!dateValue) return null;
  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) return null;
  return DAY_BY_WEEKDAY[parsed.getDay()] || null;
};

const getCanchaId = (partido) => partido?.cancha_id || partido?.cancha?.id || null;
const getCanchaNameFromPartido = (partido) => partido?.cancha?.nombre || partido?.cancha_nombre || partido?.cancha || '';

const getCanchaKeyFromId = (id) => (id === null || id === undefined || id === '' ? '' : `id:${String(id)}`);
const getCanchaKeyFromName = (name) => {
  const normalized = normalizeCanchaName(name);
  return normalized ? `name:${normalized}` : '';
};

const getCanchaRefFromPartido = (partido) => {
  const canchaId = getCanchaId(partido);
  if (canchaId !== null && canchaId !== undefined && canchaId !== '') {
    return {
      key: getCanchaKeyFromId(canchaId),
      id: canchaId,
      nombre: getCanchaNameFromPartido(partido),
    };
  }

  const canchaName = getCanchaNameFromPartido(partido);
  const canchaKey = getCanchaKeyFromName(canchaName);
  if (!canchaKey) return null;

  return {
    key: canchaKey,
    id: null,
    nombre: canchaName,
  };
};

const getCanchaLabel = (cancha) => cancha?.nombre || cancha?.label || `Cancha ${cancha?.id || '-'}`;

const getPartidoId = (partido) => getFirstNonEmpty([
  partido?.id,
  partido?.partido_id,
  partido?.partidoId,
  partido?.match_id,
  partido?.matchId,
]);

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
  const player = side === 1 ? partido?.jugador1 : partido?.jugador2;
  const idFields = side === 1
    ? ['jugador1_id', 'player1_id', 'participante1_id', 'competidor1_id', 'jugador_1_id', 'id_jugador_1']
    : ['jugador2_id', 'player2_id', 'participante2_id', 'competidor2_id', 'jugador_2_id', 'id_jugador_2'];

  return getFirstNonEmpty([
    player?.id,
    ...idFields.map((field) => partido?.[field]),
  ]);
};

const getOrigenPartidoId = (partido, side) => {
  const originFields = side === 1
    ? ['jugador1_origen_partido_id', 'partido_anterior_1_id', 'origen_partido_1_id', 'previous_match_1_id']
    : ['jugador2_origen_partido_id', 'partido_anterior_2_id', 'origen_partido_2_id', 'previous_match_2_id'];

  return getFirstNonEmpty(originFields.map((field) => partido?.[field]));
};

const getJugadorLabel = (partido, side) => {
  const player = side === 1 ? partido?.jugador1 : partido?.jugador2;
  const partner = side === 1 ? partido?.jugador1_pareja : partido?.jugador2_pareja;

  const nameFields = side === 1
    ? ['jugador1_nombre', 'nombre_jugador_1', 'player1_name', 'jugador1_pareja_nombre', 'nombre_pareja_jugador_1']
    : ['jugador2_nombre', 'nombre_jugador_2', 'player2_name', 'jugador2_pareja_nombre', 'nombre_pareja_jugador_2'];

  for (const field of nameFields) {
    if (partido?.[field]) return partido[field];
  }

  const titularName = getNombreCompletoJugador(player);
  const parejaName = getNombreCompletoJugador(partner);

  if (titularName && parejaName) {
    return `${titularName} / ${parejaName}`;
  }

  if (titularName) return titularName;
  if (parejaName) return parejaName;

  return '';
};

const getCategoriaRama = (partido) => {
  const categoria = partido?.categoria || partido?.torneo_categoria || partido?.categoria_nombre || '-';
  const rama = partido?.rama || partido?.sexo || partido?.branch || '-';
  return `${categoria} / ${rama}`;
};

const getPartidoMarcador = (partido) => {
  return String(partido?.marcador_en_vivo || partido?.score || partido?.resultado || partido?.marcador || '').trim();
};

const slotKey = ({ canchaKey, time, day }) => `${String(canchaKey)}__${time}__${day}`;

const getNextDateByWeekday = (weekday) => {
  const date = new Date();
  date.setSeconds(0, 0);

  const today = date.getDay();
  const delta = (weekday - today + 7) % 7;
  date.setDate(date.getDate() + delta);
  return date;
};

const composeSlotDateTime = ({ dayKey, time, referenceByDay }) => {
  const dayConfig = DAY_OPTIONS.find((item) => item.key === dayKey);
  const baseDate = referenceByDay[dayKey]
    ? new Date(referenceByDay[dayKey])
    : getNextDateByWeekday(dayConfig?.weekday ?? 5);

  const [hours, minutes] = time.split(':').map(Number);
  baseDate.setHours(hours || 0, minutes || 0, 0, 0);
  return baseDate.toISOString();
};

const buildCanchaCatalog = ({ canchas, partidos }) => {
  const canchaMap = new Map();
  const canchaKeyById = new Map();
  const canchaKeyByName = new Map();

  const registerCancha = ({ id, nombre, keyHint }) => {
    const normalizedName = normalizeCanchaName(nombre);
    const idKey = hasValue(id) ? getCanchaKeyFromId(id) : '';

    const existingKey = (hasValue(id) && canchaKeyById.get(String(id)))
      || (normalizedName && canchaKeyByName.get(normalizedName));

    if (existingKey && canchaMap.has(existingKey)) {
      const existing = canchaMap.get(existingKey);

      if (!hasValue(existing.id) && hasValue(id)) {
        existing.id = id;
        canchaKeyById.set(String(id), existingKey);
      }

      if ((!existing.nombre || existing.nombre === 'Sin cancha') && nombre) {
        existing.nombre = nombre;
      }

      if (normalizedName) {
        canchaKeyByName.set(normalizedName, existingKey);
      }

      return existingKey;
    }

    const finalKey = keyHint || idKey || getCanchaKeyFromName(nombre) || `generated:${canchaMap.size + 1}`;
    canchaMap.set(finalKey, {
      key: finalKey,
      id: hasValue(id) ? id : null,
      nombre: nombre || 'Sin cancha',
    });

    if (hasValue(id)) {
      canchaKeyById.set(String(id), finalKey);
    }

    if (normalizedName) {
      canchaKeyByName.set(normalizedName, finalKey);
    }

    return finalKey;
  };

  canchas.forEach((cancha) => {
    registerCancha({
      id: cancha?.id,
      nombre: getCanchaLabel(cancha),
      keyHint: hasValue(cancha?.id) ? getCanchaKeyFromId(cancha.id) : getCanchaKeyFromName(getCanchaLabel(cancha)),
    });
  });

  partidos.forEach((partido) => {
    const canchaRef = getCanchaRefFromPartido(partido);
    if (!canchaRef) return;

    registerCancha({
      id: canchaRef.id,
      nombre: canchaRef.nombre || getCanchaLabel(partido?.cancha),
      keyHint: canchaRef.key,
    });
  });

  const list = Array.from(canchaMap.values()).sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));

  if (list.length === 0) {
    return {
      list: [{ key: 'sin-cancha', id: null, nombre: 'Sin cancha' }],
      canchaKeyById,
      canchaKeyByName,
    };
  }

  return {
    list,
    canchaKeyById,
    canchaKeyByName,
  };
};

export default function CronogramaTorneo({
  partidos = [],
  canchas = [],
  adminMode = false,
  onRefresh,
  onProgramarPartido,
  onReprogramarPartido,
  onIniciarPartido,
  onActualizarMarcadorRapido,
  onFinalizarPartidoRapido,
  onAbrirResultado,
  onPublicarCronograma,
  publishing = false,
  actionBusy = false,
  torneoTitulo = '',
  clubLogoUrl = '',
}) {
  const [selectedDay, setSelectedDay] = useState('viernes');
  const [slotModal, setSlotModal] = useState({ open: false, canchaId: null, canchaKey: '', time: '' });
  const [selectedPartidoId, setSelectedPartidoId] = useState('');
  const [savingManual, setSavingManual] = useState(false);
  const [draggedPartidoId, setDraggedPartidoId] = useState(null);
  const [dragSourceSlot, setDragSourceSlot] = useState(null);
  const [dragOverSlot, setDragOverSlot] = useState('');
  const [liveScoreByPartido, setLiveScoreByPartido] = useState({});
  const [mobileCanchaIdx, setMobileCanchaIdx] = useState(0);
  const [canchaFilter, setCanchaFilter] = useState('');
  const [exportingSchedule, setExportingSchedule] = useState(false);

  const referenceDateByDay = useMemo(() => {
    const referenceMap = {};

    partidos.forEach((partido) => {
      if (!partido?.fecha_hora) return;
      const dayKey = getDayKeyFromDate(partido.fecha_hora);
      if (!dayKey) return;

      const parsed = new Date(partido.fecha_hora);
      if (Number.isNaN(parsed.getTime())) return;

      if (!referenceMap[dayKey] || parsed < referenceMap[dayKey]) {
        referenceMap[dayKey] = parsed;
      }
    });

    return referenceMap;
  }, [partidos]);

  const canchaCatalog = useMemo(() => buildCanchaCatalog({ canchas, partidos }), [canchas, partidos]);
  const canchasGrid = canchaCatalog.list;

  const jugadoresResueltosPorPartido = useMemo(() => {
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
    const winnerNameByMatchId = {};

    const sortRoundMatches = (matches = []) => {
      return [...matches].sort((a, b) => {
        const byOrder = Number(a?.orden_en_ronda || 0) - Number(b?.orden_en_ronda || 0);
        if (byOrder !== 0) return byOrder;
        return String(getPartidoId(a) || '').localeCompare(String(getPartidoId(b) || ''));
      });
    };

    const resolveSideName = (partido, side) => {
      const originMatchId = getOrigenPartidoId(partido, side);
      if (originMatchId) {
        const winnerName = winnerNameByMatchId[String(originMatchId)] || '';
        return winnerName || 'Por definir';
      }

      return getJugadorLabel(partido, side) || 'Por definir';
    };

    roundOrders.forEach((roundOrder) => {
      const roundMatches = sortRoundMatches(byRound[roundOrder] || []);

      roundMatches.forEach((partido) => {
        const partidoId = getPartidoId(partido);
        if (!partidoId) return;

        const j1Name = resolveSideName(partido, 1);
        const j2Name = resolveSideName(partido, 2);
        const j1Id = getJugadorId(partido, 1);
        const j2Id = getJugadorId(partido, 2);

        resolved[partidoId] = { j1Name, j2Name };

        const winnerId = String(partido?.ganador_id || '').trim();
        if (!winnerId) return;

        const winnerName = winnerId === String(j1Id || '').trim()
          ? j1Name
          : winnerId === String(j2Id || '').trim()
            ? j2Name
            : '';

        if (winnerName) winnerNameByMatchId[partidoId] = winnerName;
      });
    });

    return resolved;
  }, [partidos]);

  const getJugadorLabelResuelto = (partido, side) => {
    const partidoId = getPartidoId(partido);
    const resolved = partidoId ? jugadoresResueltosPorPartido[partidoId] : null;

    if (resolved) {
      if (side === 1 && resolved.j1Name) return resolved.j1Name;
      if (side === 2 && resolved.j2Name) return resolved.j2Name;
    }

    return getJugadorLabel(partido, side) || 'Por definir';
  };

  const partidosDelDia = useMemo(
    () => partidos.filter((partido) => getDayKeyFromDate(partido?.fecha_hora) === selectedDay),
    [partidos, selectedDay]
  );

  const slots = useMemo(() => {
    const dynamicSlots = new Set(BASE_SLOTS);

    partidosDelDia.forEach((partido) => {
      const parsed = new Date(partido.fecha_hora);
      if (Number.isNaN(parsed.getTime())) return;
      dynamicSlots.add(format(parsed, 'HH:mm'));
    });

    return Array.from(dynamicSlots).sort((a, b) => toMinutes(a) - toMinutes(b));
  }, [partidosDelDia]);

  const partidosBySlot = useMemo(() => {
    const map = new Map();

    partidosDelDia.forEach((partido) => {
      const canchaRef = getCanchaRefFromPartido(partido);
      if (!canchaRef?.key || !partido?.fecha_hora) return;

      const parsed = new Date(partido.fecha_hora);
      if (Number.isNaN(parsed.getTime())) return;

      const time = format(parsed, 'HH:mm');
      const canonicalKey = (hasValue(canchaRef.id) && canchaCatalog.canchaKeyById.get(String(canchaRef.id)))
        || canchaCatalog.canchaKeyByName.get(normalizeCanchaName(canchaRef.nombre))
        || canchaRef.key;

      if (!canonicalKey) return;
      map.set(slotKey({ canchaKey: canonicalKey, time, day: selectedDay }), partido);
    });

    return map;
  }, [partidosDelDia, selectedDay, canchaCatalog]);

  const partidosAsignables = useMemo(() => {
    return partidos
      .filter((partido) => {
        const estado = getPartidoEstado(partido);
        return estado.key !== 'finalizado';
      })
      .sort((a, b) => Number(a.id) - Number(b.id));
  }, [partidos]);

  const exportScheduleToPDF = async () => {
    if (exportingSchedule) return;
    setExportingSchedule(true);
    try {
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageW  = pdf.internal.pageSize.getWidth();
      const mL     = 12;
      const mR     = 12;
      const today  = format(new Date(), 'dd/MM/yyyy HH:mm');

      // ── Helpers ──────────────────────────────────────────────────────
      const drawPageHeader = (fechaLabel, catLabel) => {
        let y = 12;

        // Club name
        if (clubLogoUrl === '' && !torneoTitulo) {
          // nothing
        }
        if (torneoTitulo) {
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(8);
          pdf.setTextColor(120, 120, 120);
          pdf.text((torneoTitulo).toUpperCase(), pageW / 2, y, { align: 'center' });
          y += 5;
        }

        // Big date header
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(14);
        pdf.setTextColor(10, 22, 40);
        pdf.text(`HOJA DE PARTIDOS — ${fechaLabel.toUpperCase()}`, pageW / 2, y, { align: 'center' });
        y += 5.5;

        // Category sub-header
        if (catLabel) {
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(8.5);
          pdf.setTextColor(60, 60, 60);
          pdf.text(catLabel, pageW / 2, y, { align: 'center' });
          y += 4.5;
        }

        // Rule line
        pdf.setDrawColor(180, 180, 180);
        pdf.setLineWidth(0.3);
        pdf.line(mL, y, pageW - mR, y);
        y += 4;

        return y;
      };

      const drawFooter = () => {
        const pageH = pdf.internal.pageSize.getHeight();
        pdf.setFont('helvetica', 'italic');
        pdf.setFontSize(6.5);
        pdf.setTextColor(160, 160, 160);
        pdf.text(
          `Generado por SetGo · ${today}  ·  Hoja ${pdf.internal.getNumberOfPages()}`,
          pageW / 2,
          pageH - 5,
          { align: 'center' },
        );
      };

      // ── Agrupar partidos por día del torneo (igual que las pestañas del cronograma) ─
      const sorted = [...partidos]
        .filter((p) => p?.fecha_hora && getDayKeyFromDate(p.fecha_hora) !== null)
        .sort((a, b) => new Date(a.fecha_hora) - new Date(b.fecha_hora));

      // Detectar categoría global (del primer partido disponible)
      const p0        = sorted[0];
      const globalCat = [
        p0?.categoria || p0?.torneo_categoria || p0?.categoria_nombre || '',
        p0?.rama || p0?.sexo || '',
      ].filter(Boolean).join(' · ');

      // Map: dayKey ('viernes'/'sabado'/'domingo') → partidos[] - respeta orden de DAY_OPTIONS
      const byDay = new Map();
      DAY_OPTIONS.forEach(({ key }) => byDay.set(key, []));
      sorted.forEach((p) => {
        const key = getDayKeyFromDate(p.fecha_hora);
        if (byDay.has(key)) byDay.get(key).push(p);
      });

      // Solo incluir días que tienen partidos, en el orden de DAY_OPTIONS
      const days = [...byDay.entries()].filter(([, ps]) => ps.length > 0);

      days.forEach(([, dayPartidos], dayIdx) => {
        if (dayIdx > 0) pdf.addPage();

        // Obtener la fecha real del primer partido de ese día para el encabezado
        const fechaLabel = format(new Date(dayPartidos[0].fecha_hora), "EEEE d 'de' MMMM 'de' yyyy", { locale: es });
        const startY     = drawPageHeader(fechaLabel, globalCat);

        const rows = dayPartidos.map((p) => {
          const hora   = format(new Date(p.fecha_hora), 'HH:mm');
          const cancha = getCanchaNameFromPartido(p) || String(getCanchaId(p) || '') || '-';
          const j1     = getJugadorLabel(p, 1) || 'Por definir';
          const j2     = getJugadorLabel(p, 2) || 'Por definir';
          return [hora, cancha, `${j1}  vs  ${j2}`, ''];
        });

        autoTable(pdf, {
          startY,
          head: [['HORA', 'CANCHA', 'PARTIDO', 'RESULTADO / SCORE']],
          body: rows,
          styles: {
            fontSize: 10,
            cellPadding: { top: 3.5, bottom: 3.5, left: 2.5, right: 2.5 },
            lineColor: [180, 180, 180],
            lineWidth: 0.2,
            valign: 'middle',
          },
          headStyles: {
            fillColor: [10, 22, 40],
            textColor: 255,
            fontStyle: 'bold',
            fontSize: 9,
            halign: 'center',
          },
          alternateRowStyles: { fillColor: [247, 249, 252] },
          columnStyles: {
            0: { cellWidth: 16, halign: 'center', fontStyle: 'bold' },
            1: { cellWidth: 30 },
            2: { cellWidth: 'auto' },
            3: { cellWidth: 42, halign: 'center', textColor: [180, 180, 180] },
          },
          // Celda de resultado: texto punteado como guía para escribir a mano
          didParseCell: (data) => {
            if (data.section === 'body' && data.column.index === 3 && data.cell.raw === '') {
              data.cell.text = ['· · · · · · · · · · · ·'];
            }
          },
          margin: { left: mL, right: mR },
        });

        drawFooter();
      });

      // Si no había partidos con fecha
      if (days.length === 0) {
        drawPageHeader('SIN FECHA ASIGNADA', globalCat);
        drawFooter();
      }

      const fileName = torneoTitulo
        ? `cronograma-${torneoTitulo.replace(/\s+/g, '-').toLowerCase()}.pdf`
        : 'cronograma-torneo.pdf';
      pdf.save(fileName);
    } catch (err) {
      console.error('[exportScheduleToPDF]', err);
    } finally {
      setExportingSchedule(false);
    }
  };

  const openManualModal = ({ canchaId, canchaKey, time }) => {
    if (!adminMode) return;
    setSelectedPartidoId('');
    setSlotModal({ open: true, canchaId, canchaKey, time });
  };

  const closeManualModal = () => {
    setSlotModal({ open: false, canchaId: null, canchaKey: '', time: '' });
    setSelectedPartidoId('');
  };

  const handleManualAssign = async (event) => {
    event.preventDefault();
    if (!selectedPartidoId || !slotModal.canchaId || !slotModal.time || !onProgramarPartido) return;

    setSavingManual(true);

    const payload = {
      canchaId: slotModal.canchaId,
      hora: slotModal.time,
      dia: selectedDay,
      fechaHora: composeSlotDateTime({
        dayKey: selectedDay,
        time: slotModal.time,
        referenceByDay: referenceDateByDay,
      }),
    };

    const ok = await onProgramarPartido(selectedPartidoId, payload);
    setSavingManual(false);

    if (ok) {
      closeManualModal();
    }
  };

  const buildSlotPayload = ({ canchaId, time }) => {
    return {
      canchaId,
      hora: time,
      dia: selectedDay,
      fechaHora: composeSlotDateTime({
        dayKey: selectedDay,
        time,
        referenceByDay: referenceDateByDay,
      }),
    };
  };

  const clearDragState = () => {
    setDraggedPartidoId(null);
    setDragSourceSlot(null);
    setDragOverSlot('');
  };

  const handleDragStart = (event, partidoId, sourceSlot) => {
    if (!adminMode || !partidoId) return;

    const dragId = String(partidoId);
    setDraggedPartidoId(dragId);
    setDragSourceSlot(sourceSlot || null);

    if (event?.dataTransfer) {
      event.dataTransfer.setData('text/plain', dragId);
      event.dataTransfer.effectAllowed = 'move';
    }
  };

  const handleDrop = async ({ canchaId, time, slotId, dragEvent, targetPartido }) => {
    const dropId = dragEvent?.dataTransfer?.getData('text/plain') || draggedPartidoId;
    if (!adminMode || !dropId || !onReprogramarPartido || !canchaId) return;

    if (targetPartido && String(targetPartido.id) === String(dropId)) {
      clearDragState();
      return;
    }

    const destinationPayload = buildSlotPayload({ canchaId, time });

    // Si el slot destino ya tiene partido, hacemos swap con el slot origen del drag.
    if (targetPartido?.id && dragSourceSlot?.canchaId && dragSourceSlot?.time) {
      const originPayload = buildSlotPayload({ canchaId: dragSourceSlot.canchaId, time: dragSourceSlot.time });

      const movedDragged = await onReprogramarPartido(dropId, destinationPayload);
      if (!movedDragged) {
        clearDragState();
        return;
      }

      await onReprogramarPartido(targetPartido.id, originPayload);
      clearDragState();
      return;
    }

    await onReprogramarPartido(dropId, destinationPayload);
    clearDragState();
  };

  const dayLabel = DAY_OPTIONS.find((day) => day.key === selectedDay)?.label || 'Dia';

  const displayCanchas = canchaFilter
    ? canchasGrid.filter((c) => c.key === canchaFilter)
    : canchasGrid;

  const getLiveScoreValue = (partido) => {
    const partidoId = String(partido?.id || '');
    if (!partidoId) return '';
    if (Object.prototype.hasOwnProperty.call(liveScoreByPartido, partidoId)) {
      return liveScoreByPartido[partidoId];
    }
    return getPartidoMarcador(partido);
  };

  const setLiveScoreValue = (partidoId, value) => {
    const key = String(partidoId || '');
    if (!key) return;
    setLiveScoreByPartido((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleIniciarPartidoClick = async (partido) => {
    if (!onIniciarPartido) return;
    await onIniciarPartido(partido);
  };

  const handleActualizarMarcadorClick = async (partido) => {
    if (!onActualizarMarcadorRapido || !partido?.id) return;
    const marcador = getLiveScoreValue(partido);
    const ok = await onActualizarMarcadorRapido(partido.id, marcador);
    if (ok) {
      setLiveScoreValue(partido.id, marcador.trim());
    }
  };

  const handleFinalizarPartidoClick = async (partido) => {
    if (!onFinalizarPartidoRapido || !partido?.id) return;
    const marcador = getLiveScoreValue(partido);
    await onFinalizarPartidoRapido(partido.id, marcador);
  };

  // ── Slot card renderer ─────────────────────────────────────────────────────
  const renderSlotCard = (partido, cancha, time, key) => {
    const isSameDraggedMatch = partido && draggedPartidoId && String(partido.id) === String(draggedPartidoId);
    const canReceiveDrop = Boolean(adminMode && draggedPartidoId && !actionBusy && cancha.id && !isSameDraggedMatch);
    const isDropTarget = dragOverSlot === key && canReceiveDrop;

    const dropHandlers = {
      onDragOver: (e) => { if (!canReceiveDrop) return; e.preventDefault(); setDragOverSlot(key); },
      onDragLeave: () => { if (dragOverSlot === key) setDragOverSlot(''); },
      onDrop: async (e) => { if (!canReceiveDrop) return; e.preventDefault(); await handleDrop({ canchaId: cancha.id, time, slotId: key, dragEvent: e, targetPartido: partido ?? null }); },
    };

    if (partido) {
      const estadoPartido = getPartidoEstado(partido);
      const isEnJuego = estadoPartido.key === 'en_juego';
      const isProgramado = estadoPartido.key === 'programado';
      const isFinalizado = estadoPartido.key === 'finalizado';
      const marcador = getPartidoMarcador(partido);
      const j1 = getJugadorLabelResuelto(partido, 1);
      const j2 = getJugadorLabelResuelto(partido, 2);
      const catRama = getCategoriaRama(partido);

      return (
        <div
          key={key}
          draggable={adminMode}
          onDragStart={(e) => handleDragStart(e, partido.id, { canchaId: cancha.id, time, slotId: key })}
          onDragEnd={clearDragState}
          {...dropHandlers}
          className={`relative rounded-xl p-3 overflow-hidden transition-all select-none ${
            adminMode ? 'cursor-grab active:cursor-grabbing' : ''
          } ${
            isDropTarget ? 'ring-2 ring-[#a6ce39]/60' : ''
          } ${
            isEnJuego
              ? 'bg-amber-500/10 border border-amber-400/30'
              : isFinalizado
                ? 'bg-emerald-500/8 border border-emerald-400/15'
                : 'bg-sky-500/8 border border-sky-400/20'
          }`}
        >
          {/* Live animated overlay */}
          {isEnJuego && (
            <div className="absolute inset-0 bg-gradient-to-br from-amber-400/8 to-orange-500/5 animate-pulse pointer-events-none rounded-xl" />
          )}

          <div className="relative">
            {/* Status badge */}
            <div className="flex items-center justify-between gap-1 mb-2">
              {isEnJuego && (
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-ping shrink-0" />
                  <span className="text-[10px] font-black text-amber-400 uppercase tracking-wide">En Juego</span>
                </div>
              )}
              {isFinalizado && (
                <div className="flex items-center gap-1">
                  <Check className="h-3 w-3 text-emerald-400 shrink-0" />
                  <span className="text-[10px] font-black text-emerald-400 uppercase tracking-wide">Finalizado</span>
                </div>
              )}
              {isProgramado && (
                <span className="text-[10px] font-black text-sky-400 uppercase tracking-wide">Programado</span>
              )}
              <span className="text-[10px] text-white/20 ml-auto shrink-0">#{partido.id}</span>
            </div>

            {/* Players */}
            <p className="text-xs font-bold text-white leading-tight truncate">{j1}</p>
            <p className="text-[10px] text-white/30 my-0.5">vs</p>
            <p className="text-xs font-bold text-white leading-tight truncate">{j2}</p>
            <p className="text-[10px] text-white/25 mt-1 truncate">{catRama}</p>

            {/* Live/final score */}
            {marcador && (isEnJuego || isFinalizado) && (
              <p className={`text-sm font-black text-center mt-2 ${
                isEnJuego ? 'text-amber-300' : 'text-emerald-300'
              }`}>
                {marcador}
              </p>
            )}

            {/* Admin actions */}
            {adminMode && (
              <div className="mt-3 space-y-1.5" onClick={(e) => e.stopPropagation()}>
                {isProgramado && (
                  <button
                    type="button"
                    onClick={() => handleIniciarPartidoClick(partido)}
                    disabled={actionBusy}
                    className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-[#a6ce39]/15 border border-[#a6ce39]/30 text-[#a6ce39] text-[11px] font-black px-2 py-1.5 hover:bg-[#a6ce39]/25 disabled:opacity-50 transition-colors"
                  >
                    <Play className="h-3 w-3" />
                    Iniciar partido
                  </button>
                )}

                {isEnJuego && (
                  <div className="space-y-1.5">
                    <input
                      type="text"
                      value={getLiveScoreValue(partido)}
                      onChange={(e) => setLiveScoreValue(partido.id, e.target.value)}
                      placeholder="Ej: 6-4 6-3"
                      className="w-full rounded-lg border border-amber-400/30 bg-amber-500/10 px-2.5 py-1.5 text-xs font-semibold text-white placeholder-white/25 focus:outline-none focus:border-amber-400/60"
                    />
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleActualizarMarcadorClick(partido)}
                        disabled={actionBusy}
                        className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-2 py-1.5 text-[11px] font-bold text-amber-300 hover:bg-amber-500/20 disabled:opacity-50 transition-colors"
                      >
                        Actualizar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleFinalizarPartidoClick(partido)}
                        disabled={actionBusy}
                        className="rounded-lg bg-white/8 border border-white/12 px-2 py-1.5 text-[11px] font-bold text-white/60 hover:bg-white/15 hover:text-white disabled:opacity-50 transition-colors"
                      >
                        Finalizar
                      </button>
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => onAbrirResultado?.(partido)}
                  disabled={actionBusy}
                  className={`w-full flex items-center justify-center gap-1.5 rounded-lg border text-[11px] font-bold px-2 py-1.5 disabled:opacity-50 transition-colors ${
                    isEnJuego
                      ? 'bg-amber-500/20 border-amber-400/40 text-amber-300 hover:bg-amber-500/30'
                      : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <Check className="h-3 w-3" />
                  Cargar resultado
                </button>
              </div>
            )}
          </div>
        </div>
      );
    }

    // Empty slot
    return (
      <button
        key={key}
        type="button"
        onClick={() => openManualModal({ canchaId: cancha.id, canchaKey: cancha.key, time })}
        {...dropHandlers}
        disabled={!adminMode || actionBusy || !cancha.id}
        className={`w-full min-h-[72px] rounded-xl border border-dashed flex items-center justify-center transition-all ${
          isDropTarget
            ? 'border-[#a6ce39]/50 bg-[#a6ce39]/5 text-[#a6ce39]'
            : adminMode && cancha.id
              ? 'border-white/10 bg-white/[0.015] text-white/15 hover:border-[#a6ce39]/30 hover:bg-[#a6ce39]/5 hover:text-[#a6ce39]/50'
              : 'border-white/5 bg-transparent cursor-default'
        }`}
      >
        {adminMode && cancha.id && <Plus className="h-4 w-4" />}
      </button>
    );
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm p-5 mt-6">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5">
        <div>
          <h3 className="text-xl font-black text-white uppercase tracking-tight flex items-center gap-2">
            <Clock className="h-5 w-5 text-[#a6ce39] shrink-0" />
            Cronograma
          </h3>
          <p className="text-xs text-white/35 mt-0.5">
            {adminMode
              ? 'Arrastrá para reprogramar · Tocá un slot vacío para asignar'
              : `${dayLabel} · Horarios y canchas del torneo`}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <button
            type="button"
            onClick={onRefresh}
            title="Refrescar"
            className="p-2 rounded-lg bg-white/5 border border-white/10 text-white/40 hover:text-white hover:border-white/20 transition-colors"
          >
            <RefreshCcw className="h-4 w-4" />
          </button>
          {adminMode && (
            <button
              type="button"
              onClick={exportScheduleToPDF}
              disabled={exportingSchedule}
              title="Exportar cronograma a PDF"
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white/60 text-xs font-bold hover:text-white hover:border-white/20 disabled:opacity-50 transition-colors"
            >
              <FileText className="h-3.5 w-3.5" />
              {exportingSchedule ? 'Generando…' : 'Exportar PDF'}
            </button>
          )}
          {adminMode && (
            <button
              type="button"
              onClick={onPublicarCronograma}
              disabled={publishing}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#a6ce39]/15 border border-[#a6ce39]/30 text-[#a6ce39] text-sm font-black hover:bg-[#a6ce39]/25 disabled:opacity-50 transition-colors"
            >
              <Check className="h-3.5 w-3.5" />
              {publishing ? 'Publicando…' : 'Publicar'}
            </button>
          )}
        </div>
      </div>

      {/* ── Filtros: día + cancha ────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-x-4 gap-y-3 mb-5">
        {/* Día pills */}
        <div className="flex gap-1.5 flex-wrap">
          {DAY_OPTIONS.map((day) => (
            <button
              key={day.key}
              type="button"
              onClick={() => setSelectedDay(day.key)}
              className={`px-3.5 py-1 rounded-full text-xs font-black transition-all ${
                selectedDay === day.key
                  ? 'bg-[#a6ce39] text-[#0a1628] shadow-[0_0_10px_rgba(166,206,57,0.3)]'
                  : 'bg-white/5 border border-white/10 text-white/50 hover:text-white hover:border-white/20'
              }`}
            >
              {day.label}
            </button>
          ))}
        </div>

        {/* Cancha filter pills — solo si hay más de 1 */}
        {canchasGrid.length > 1 && (
          <div className="flex gap-1.5 flex-wrap items-center">
            <span className="text-[10px] text-white/30 font-black uppercase tracking-wide flex items-center gap-1">
              <MapPin className="h-3 w-3" />
            </span>
            <button
              type="button"
              onClick={() => setCanchaFilter('')}
              className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
                canchaFilter === ''
                  ? 'bg-white/15 border border-white/25 text-white'
                  : 'bg-white/5 border border-white/10 text-white/40 hover:text-white/70'
              }`}
            >
              Todas
            </button>
            {canchasGrid.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setCanchaFilter(c.key === canchaFilter ? '' : c.key)}
                className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
                  canchaFilter === c.key
                    ? 'bg-white/15 border border-white/25 text-white'
                    : 'bg-white/5 border border-white/10 text-white/40 hover:text-white/70'
                }`}
              >
                {c.nombre}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Mobile: carrusel por cancha ──────────────────────────────────── */}
      <div className="md:hidden">
        {canchasGrid.length > 0 && (() => {
          const clampedIdx = Math.min(mobileCanchaIdx, canchasGrid.length - 1);
          const cancha = canchasGrid[clampedIdx];
          return (
            <>
              {/* Cancha nav */}
              <div className="flex items-center justify-between mb-4 bg-white/[0.04] border border-white/8 rounded-xl px-3 py-2">
                <button
                  type="button"
                  onClick={() => setMobileCanchaIdx((i) => Math.max(0, i - 1))}
                  disabled={clampedIdx === 0}
                  className="p-1.5 rounded-lg bg-white/5 text-white/50 disabled:opacity-25 hover:text-white transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div className="flex items-center gap-2 text-sm font-black text-white">
                  <MapPin className="h-4 w-4 text-[#a6ce39]" />
                  <span>{cancha.nombre}</span>
                  <span className="text-white/25 text-xs font-normal">{clampedIdx + 1}/{canchasGrid.length}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileCanchaIdx((i) => Math.min(canchasGrid.length - 1, i + 1))}
                  disabled={clampedIdx >= canchasGrid.length - 1}
                  className="p-1.5 rounded-lg bg-white/5 text-white/50 disabled:opacity-25 hover:text-white transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              {/* Rows */}
              <div className="space-y-2">
                {slots.map((time) => {
                  const key = slotKey({ canchaKey: cancha.key, time, day: selectedDay });
                  const partido = partidosBySlot.get(key);
                  return (
                    <div key={key} className="flex gap-3 items-start">
                      <div className="shrink-0 w-11 pt-3 flex flex-col items-center gap-0.5">
                        <Clock className="h-3 w-3 text-white/25" />
                        <span className="text-[10px] font-bold text-white/35">{time}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        {renderSlotCard(partido, cancha, time, key)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          );
        })()}
      </div>

      {/* ── Desktop: tabla de rejilla ────────────────────────────────────── */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-white/8">
        <table className="min-w-full border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="sticky left-0 z-20 bg-white/[0.04] border-b border-r border-white/8 px-3 py-2.5 text-left w-16 min-w-[4rem]">
                <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-white/35">
                  <Clock className="h-3 w-3" />
                  Hora
                </div>
              </th>
              {displayCanchas.map((cancha) => (
                <th
                  key={cancha.key}
                  className="bg-white/[0.04] border-b border-r border-white/8 px-3 py-2.5 text-left min-w-[200px]"
                >
                  <div className="flex items-center gap-1.5 text-xs font-black text-white/60">
                    <MapPin className="h-3 w-3 text-[#a6ce39] shrink-0" />
                    {cancha.nombre}
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-white/5">
            {slots.map((time) => (
              <tr key={`${selectedDay}-${time}`} className="group">
                <td className="sticky left-0 z-10 bg-[#0a1628] group-hover:bg-white/[0.02] border-r border-white/8 px-3 py-2 transition-colors">
                  <div className="flex flex-col items-center gap-0.5">
                    <Clock className="h-3 w-3 text-white/20" />
                    <span className="text-[11px] font-black text-white/40 whitespace-nowrap">{time}</span>
                  </div>
                </td>
                {displayCanchas.map((cancha) => {
                  const key = slotKey({ canchaKey: cancha.key, time, day: selectedDay });
                  const partido = partidosBySlot.get(key);
                  return (
                    <td
                      key={key}
                      className="align-top border-r border-white/5 p-2 bg-transparent"
                    >
                      {renderSlotCard(partido, cancha, time, key)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Modal: asignación manual ─────────────────────────────────────── */}
      {slotModal.open && adminMode && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleManualAssign}
            className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#0d1d35] shadow-2xl p-6 space-y-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="text-lg font-black text-white">Asignar Partido</h4>
                <p className="text-xs text-white/40 mt-0.5">
                  {dayLabel} · {slotModal.time} · {getCanchaLabel(canchasGrid.find((c) => c.key === slotModal.canchaKey))}
                </p>
              </div>
              <button
                type="button"
                onClick={closeManualModal}
                className="text-white/40 hover:text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-black text-white/50 uppercase tracking-wide mb-2">
                Partido
              </label>
              <select
                required
                value={selectedPartidoId}
                onChange={(event) => setSelectedPartidoId(event.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-white/5 border border-white/15 text-sm text-white focus:outline-none focus:border-[#a6ce39]/60"
              >
                <option value="">Seleccionar partido…</option>
                {partidosAsignables.map((partido) => {
                  const descripcion = `${getJugadorLabelResuelto(partido, 1)} vs ${getJugadorLabelResuelto(partido, 2)}`;
                  return (
                    <option key={partido.id} value={partido.id}>
                      #{partido.id} — {descripcion}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="flex items-center gap-2 rounded-lg border border-amber-400/20 bg-amber-500/8 px-3 py-2.5 text-xs text-amber-300">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Esta acción fuerza horario y cancha para el partido seleccionado.
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={closeManualModal}
                className="px-4 py-2 rounded-lg border border-white/15 text-white/60 hover:text-white text-sm font-semibold transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={savingManual}
                className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-[#a6ce39]/15 border border-[#a6ce39]/30 text-[#a6ce39] font-black text-sm hover:bg-[#a6ce39]/25 disabled:opacity-50 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                {savingManual ? 'Asignando…' : 'Asignar'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
