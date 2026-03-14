import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import InscripcionModal from './InscripcionModal';
import { getInscripcionWindowState } from '../lib/inscripcionWindow';
import { useAuth } from '../context/AuthContext';
import { useClub, useClubPath } from '../context/ClubContext';
import {
  IconCalendar,
  IconCourt,
  IconSearch,
  IconTag,
  IconTennisBall,
  IconUser,
  IconUsers,
} from './icons/UiIcons';

const API_URL = '';
const ESTADOS_NO_INSCRIPCION = new Set(['borrador', 'cerrado', 'finalizado', 'cancelado', 'suspendido']);
const ESTADOS_FINALIZADOS = new Set(['finalizado', 'disputado', 'terminado', 'completado']);
const ESTADOS_ACTIVOS = new Set(['abierto', 'publicado', 'activo', 'en_progreso']);
const INSCRIPTION_STATUS_PENDING = 'pendiente';
const INSCRIPTION_STATUS_APPROVED = 'aprobada';
const INSCRIPTION_STATUS_REJECTED = 'rechazada';
const SURFACE_BANNERS = {
  clay: {
    label: 'Polvo de Ladrillo',
    texture: 'linear-gradient(132deg, #4f2719 0%, #7d3e26 28%, #b26239 58%, #6d3722 100%), repeating-linear-gradient(24deg, rgba(255,255,255,0.06) 0 2px, transparent 2px 11px)',
    textureSize: 'cover, 320px 320px',
    tintClass: 'from-[#4d2f24]/70 via-[#8b4f2b]/50 to-[#0b1a2e]/65',
  },
  hard: {
    label: 'Cancha Dura',
    texture: 'linear-gradient(132deg, #0a1f39 0%, #0f4c81 36%, #2481c0 66%, #0c2f55 100%), repeating-linear-gradient(90deg, rgba(255,255,255,0.06) 0 1px, transparent 1px 16px)',
    textureSize: 'cover, 220px 220px',
    tintClass: 'from-[#0b1a2e]/70 via-[#0f4c81]/50 to-[#102e4a]/70',
  },
  grass: {
    label: 'Cesped',
    texture: 'linear-gradient(132deg, #1b4a2d 0%, #2f6f45 40%, #46a45f 67%, #275e3a 100%), repeating-linear-gradient(90deg, rgba(255,255,255,0.07) 0 2px, transparent 2px 18px)',
    textureSize: 'cover, 240px 240px',
    tintClass: 'from-[#0f3d2e]/70 via-[#2f6f45]/50 to-[#0b1a2e]/65',
  },
  default: {
    label: 'Superficie Mixta',
    texture: 'linear-gradient(132deg, #0b1a2e 0%, #0f4c81 42%, #8f6a16 100%), repeating-linear-gradient(120deg, rgba(255,255,255,0.05) 0 2px, transparent 2px 14px)',
    textureSize: 'cover, 240px 240px',
    tintClass: 'from-[#0b1a2e]/70 via-[#0f4c81]/50 to-[#8f6a16]/60',
  },
};

const COURT_OVERLAY_TONES = {
  clay: {
    lineStrong: 'rgba(255, 249, 237, 0.95)',
    lineSoft: 'rgba(255, 245, 232, 0.58)',
    fillNear: 'rgba(233, 155, 93, 0.3)',
    fillFar: 'rgba(177, 102, 57, 0.15)',
    net: 'rgba(255, 255, 255, 0.68)',
    glow: 'rgba(255, 231, 207, 0.3)',
  },
  hard: {
    lineStrong: 'rgba(232, 246, 255, 0.96)',
    lineSoft: 'rgba(217, 238, 255, 0.58)',
    fillNear: 'rgba(99, 170, 230, 0.28)',
    fillFar: 'rgba(40, 100, 160, 0.15)',
    net: 'rgba(202, 232, 255, 0.7)',
    glow: 'rgba(174, 223, 255, 0.24)',
  },
  grass: {
    lineStrong: 'rgba(236, 255, 226, 0.95)',
    lineSoft: 'rgba(223, 252, 215, 0.55)',
    fillNear: 'rgba(97, 173, 112, 0.28)',
    fillFar: 'rgba(54, 119, 63, 0.15)',
    net: 'rgba(226, 255, 221, 0.68)',
    glow: 'rgba(184, 240, 174, 0.24)',
  },
  default: {
    lineStrong: 'rgba(238, 247, 255, 0.95)',
    lineSoft: 'rgba(219, 238, 252, 0.56)',
    fillNear: 'rgba(138, 172, 210, 0.27)',
    fillFar: 'rgba(83, 122, 165, 0.14)',
    net: 'rgba(218, 238, 255, 0.7)',
    glow: 'rgba(187, 216, 249, 0.22)',
  },
};

const normalizarEstado = (estado) => (estado || 'sin_estado').toString().trim().toLowerCase();

const normalizarEstadoInscripcion = (estado) => {
  const normalizado = String(estado || '').trim().toLowerCase();
  if (!normalizado) return '';
  if (normalizado === 'pending') return INSCRIPTION_STATUS_PENDING;
  if (normalizado === 'approved') return INSCRIPTION_STATUS_APPROVED;
  if (normalizado === 'rejected') return INSCRIPTION_STATUS_REJECTED;
  if (normalizado === INSCRIPTION_STATUS_PENDING) return INSCRIPTION_STATUS_PENDING;
  if (normalizado === INSCRIPTION_STATUS_APPROVED) return INSCRIPTION_STATUS_APPROVED;
  if (normalizado === INSCRIPTION_STATUS_REJECTED) return INSCRIPTION_STATUS_REJECTED;
  return normalizado;
};

const etiquetaEstado = (estado) => {
  const estadoNormalizado = normalizarEstado(estado);

  if (estadoNormalizado === 'borrador') return 'proximo';
  if (estadoNormalizado === 'sin_estado') return 'programado';
  return estadoNormalizado;
};

const esFinalizado = (estado) => ESTADOS_FINALIZADOS.has(normalizarEstado(estado));

const textoBotonPorEstado = {
  borrador: 'Inscripciones proximamente',
  cerrado: 'Inscripción cerrada',
  finalizado: 'Torneo finalizado',
  cancelado: 'Torneo cancelado',
  suspendido: 'Suspendido',
};

const estadoVisual = (estado) => {
  const estadoNormalizado = normalizarEstado(estado);
  if (estadoNormalizado === 'abierto' || estadoNormalizado === 'publicado' || estadoNormalizado === 'activo') {
    return 'bg-[#eaf3ff] text-[#0f4c81] border border-[#b9d5f2]';
  }
  if (estadoNormalizado === 'en_progreso') {
    return 'bg-[#dbeafe] text-[#0b1a2e] border border-[#bfdbfe]';
  }
  if (estadoNormalizado === 'borrador') {
    return 'bg-[#f7edcc] text-[#8f6a16] border border-[#e7cf8d]';
  }
  if (estadoNormalizado === 'finalizado') {
    return 'bg-slate-200 text-slate-700 border border-slate-300';
  }
  return 'bg-[#edf5ff] text-[#0f4c81] border border-[#c5dbf2]';
};

const progresoColor = (porcentaje) => {
  if (porcentaje >= 100) return 'bg-[#8f6a16]';
  if (porcentaje >= 85) return 'bg-[#d4af37]';
  return 'bg-[#0f4c81]';
};

const formatFechaTorneo = (fecha) => {
  if (!fecha) return 'Fecha a confirmar';

  try {
    return format(new Date(fecha), "EEEE d 'de' MMMM, yyyy - HH:mm", { locale: es });
  } catch (_) {
    return 'Fecha a confirmar';
  }
};

const resolveSurfaceInfo = (torneo) => {
  const raw = String(
    torneo?.superficie
    || torneo?.tipo_superficie
    || torneo?.cancha_superficie
    || torneo?.surface
    || ''
  ).trim();

  const titleHint = String(torneo?.titulo || '').toLowerCase();
  const normalized = `${raw.toLowerCase()} ${titleHint}`.trim();

  if (
    normalized.includes('wimbledon')
    || normalized.includes('winbledom')
    || normalized.includes('wimbeldon')
    || normalized.includes('cesped')
    || normalized.includes('grass')
  ) {
    return { ...SURFACE_BANNERS.grass, key: 'grass' };
  }

  if (
    normalized.includes('us open')
    || normalized.includes('cemento')
    || normalized.includes('dura')
    || normalized.includes('hard')
    || normalized.includes('rapida')
    || normalized.includes('rápida')
  ) {
    return { ...SURFACE_BANNERS.hard, key: 'hard' };
  }

  if (normalized.includes('ladrillo') || normalized.includes('tierra') || normalized.includes('clay')) {
    return { ...SURFACE_BANNERS.clay, key: 'clay' };
  }

  return { ...SURFACE_BANNERS.default, key: 'default' };
};

function DetailChip({ icon: Icon, label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white/90 px-3 py-2.5">
      <p className="inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-500">
        <Icon className="h-3.5 w-3.5 text-[#0f4c81]" />
        {label}
      </p>
      <p className="mt-1 text-sm font-bold text-slate-800">{value}</p>
    </div>
  );
}

function CourtOverlay({ surfaceKey = 'default' }) {
  const tone = COURT_OVERLAY_TONES[surfaceKey] || COURT_OVERLAY_TONES.default;

  return (
    <svg
      viewBox="0 0 1200 320"
      className="h-full w-full"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`courtFill-${surfaceKey}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={tone.fillFar} />
          <stop offset="100%" stopColor={tone.fillNear} />
        </linearGradient>
      </defs>

      {/* Glow behind court lines for legibility */}
      <polygon points="250,292 1030,292 865,84 415,84" fill={tone.glow} opacity="0.55" />

      {/* Main court perspective */}
      <polygon points="265,292 1015,292 852,90 428,90" fill={`url(#courtFill-${surfaceKey})`} stroke={tone.lineStrong} strokeWidth="2.6" />

      {/* Doubles sidelines */}
      <line x1="322" y1="292" x2="476" y2="90" stroke={tone.lineStrong} strokeWidth="2.2" />
      <line x1="958" y1="292" x2="804" y2="90" stroke={tone.lineStrong} strokeWidth="2.2" />

      {/* Singles sidelines */}
      <line x1="395" y1="292" x2="535" y2="90" stroke={tone.lineSoft} strokeWidth="2" />
      <line x1="885" y1="292" x2="745" y2="90" stroke={tone.lineSoft} strokeWidth="2" />

      {/* Baselines and service lines */}
      <line x1="265" y1="292" x2="1015" y2="292" stroke={tone.lineStrong} strokeWidth="2.4" />
      <line x1="428" y1="90" x2="852" y2="90" stroke={tone.lineStrong} strokeWidth="2.2" />
      <line x1="354" y1="196" x2="926" y2="196" stroke={tone.lineSoft} strokeWidth="2" />
      <line x1="510" y1="125" x2="770" y2="125" stroke={tone.lineSoft} strokeWidth="1.9" />

      {/* Center service line and center marks */}
      <line x1="640" y1="292" x2="640" y2="90" stroke={tone.lineSoft} strokeWidth="2" />
      <line x1="635" y1="292" x2="645" y2="292" stroke={tone.lineStrong} strokeWidth="2.1" />
      <line x1="635" y1="90" x2="645" y2="90" stroke={tone.lineStrong} strokeWidth="2.1" />

      {/* Net and posts */}
      <line x1="338" y1="174" x2="942" y2="174" stroke={tone.net} strokeWidth="3.4" />
      <line x1="338" y1="171" x2="338" y2="178" stroke={tone.net} strokeWidth="2.1" />
      <line x1="942" y1="171" x2="942" y2="178" stroke={tone.net} strokeWidth="2.1" />
      <line x1="352" y1="177.5" x2="928" y2="177.5" stroke={tone.net} strokeWidth="1.4" strokeDasharray="4 6" opacity="0.7" />

      {/* Perspective helper traces */}
      <line x1="265" y1="292" x2="428" y2="90" stroke={tone.lineSoft} strokeWidth="1.3" opacity="0.55" />
      <line x1="1015" y1="292" x2="852" y2="90" stroke={tone.lineSoft} strokeWidth="1.3" opacity="0.55" />
    </svg>
  );
}

export default function CarteleraTorneos() {
  const navigate = useNavigate();
  const { clubId } = useClub();
  const toClubPath = useClubPath();
  const { isAdmin, user } = useAuth();
  const [torneos, setTorneos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [torneoSeleccionado, setTorneoSeleccionado] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState('todos');
  const [orden, setOrden] = useState('fecha_desc');
  const [misInscripcionesByTorneo, setMisInscripcionesByTorneo] = useState({});
  
  // Estado para manejar el feedback visual al inscribirse
  const [inscripcionStatus, setInscripcionStatus] = useState({ id: null, loading: false, message: null, type: null });

  useEffect(() => {
    fetchTorneosDisponibles();
  }, [clubId]);

  useEffect(() => {
    fetchMisInscripciones();
  }, [user?.id, clubId]);

  const fetchTorneosDisponibles = async () => {
    if (!clubId) {
      setTorneos([]);
      setLoading(false);
      return;
    }

    setError(null);

    try {
      setLoading(true);
      const [torneosRes, disponiblesRes, dashboardRes] = await Promise.allSettled([
        axios.get(`${API_URL}/api/torneos`, { params: { club_id: clubId } }),
        axios.get(`${API_URL}/api/torneos/disponibles`, { params: { club_id: clubId } }),
        axios.get(`${API_URL}/api/dashboard`, { params: { club_id: clubId } }),
      ]);

      const torneosEndpoint = torneosRes.status === 'fulfilled' && Array.isArray(torneosRes.value?.data)
        ? torneosRes.value.data
        : [];

      const torneosDisponibles = disponiblesRes.status === 'fulfilled' && Array.isArray(disponiblesRes.value?.data)
        ? disponiblesRes.value.data
        : [];

      const dashboardData = dashboardRes.status === 'fulfilled' ? dashboardRes.value?.data : null;
      const dashboardProximos = Array.isArray(dashboardData?.proximos_torneos)
        ? dashboardData.proximos_torneos.map((t) => ({ ...t, estado: t.estado || 'abierto' }))
        : [];

      const dashboardFinalizados = Array.isArray(dashboardData?.torneos_finalizados)
        ? dashboardData.torneos_finalizados.map((t) => ({ ...t, estado: t.estado || 'finalizado' }))
        : [];

      const fuenteBase = torneosEndpoint.length > 0 ? torneosEndpoint : torneosDisponibles;
      const torneoMap = new Map();

      [...fuenteBase, ...dashboardProximos, ...dashboardFinalizados].forEach((torneo) => {
        if (!torneo?.id) return;
        const previo = torneoMap.get(torneo.id) || {};
        torneoMap.set(torneo.id, {
          ...previo,
          ...torneo,
        });
      });

      const data = Array.from(torneoMap.values());
      if (!Array.isArray(data) || data.length === 0) {
        throw new Error('No se pudo obtener la lista de torneos.');
      }

      const torneosOrdenados = [...data].sort((a, b) => new Date(b.fecha_inicio) - new Date(a.fecha_inicio));
      setTorneos(torneosOrdenados);
    } catch (err) {
      console.error('Error al cargar torneos:', err);
      setError('No se pudieron cargar los torneos. Intenta más tarde.');
    } finally {
      setLoading(false);
    }
  };

  const fetchMisInscripciones = async () => {
    if (!user?.id || !clubId) {
      setMisInscripcionesByTorneo({});
      return;
    }

    try {
      const { data } = await axios.get(`${API_URL}/api/torneos/inscripciones/mis/${user.id}`, { params: { club_id: clubId } });
      const map = {};

      for (const row of (Array.isArray(data) ? data : [])) {
        const torneoId = row?.torneo_id;
        if (!torneoId) continue;
        map[torneoId] = normalizarEstadoInscripcion(row?.estado_inscripcion);
      }

      setMisInscripcionesByTorneo(map);
    } catch (err) {
      console.error('Error al obtener mis inscripciones:', err);
      setMisInscripcionesByTorneo({});
    }
  };

  const abrirInscripcion = (torneo) => {
    setInscripcionStatus({ id: null, loading: false, message: null, type: null });
    setTorneoSeleccionado(torneo);
  };

  const manejarInscripcionExitosa = (torneoId, data) => {
    const estadoInscripcion = normalizarEstadoInscripcion(data?.estado_inscripcion || data?.estado);

    setInscripcionStatus({
      id: torneoId,
      loading: false,
      message: data?.message || 'Inscripción registrada correctamente.',
      type: estadoInscripcion === INSCRIPTION_STATUS_PENDING ? 'warning' : 'success',
    });

    if (estadoInscripcion) {
      setMisInscripcionesByTorneo((prev) => ({
        ...prev,
        [torneoId]: estadoInscripcion,
      }));
    }

    fetchTorneosDisponibles();
    fetchMisInscripciones();

    setTimeout(() => {
      setInscripcionStatus({ id: null, loading: false, message: null, type: null });
    }, 5000);
  };

  const torneosView = useMemo(() => {
    return torneos.map((torneo) => {
      const inscritos = torneo.inscritos ?? torneo.inscritos_count ?? 0;
      const cuposMax = torneo.cupos_max || 0;
      const porcentajeOcupacion = cuposMax > 0 ? Math.min((inscritos / cuposMax) * 100, 100) : 0;
      const isFull = cuposMax > 0 ? inscritos >= cuposMax : false;
      const estado = normalizarEstado(torneo.estado);
      const isTerminado = esFinalizado(estado);
      const isEnProgreso = estado === 'en_progreso';
      const ventanaInscripcion = getInscripcionWindowState(torneo);
      const bloqueadoPorVentana = !ventanaInscripcion.canRegister;
      const miEstadoInscripcion = normalizarEstadoInscripcion(misInscripcionesByTorneo[torneo.id]);
      const tieneInscripcionRegistrada = [
        INSCRIPTION_STATUS_PENDING,
        INSCRIPTION_STATUS_APPROVED,
        INSCRIPTION_STATUS_REJECTED,
      ].includes(miEstadoInscripcion);
      const puedeInscribirse = !ESTADOS_NO_INSCRIPCION.has(estado) && !bloqueadoPorVentana && !tieneInscripcionRegistrada;
      const puedeVerCuadro = isTerminado || isEnProgreso;
      const surfaceInfo = resolveSurfaceInfo(torneo);
      const modalidad = torneo.modalidad || 'Singles';
      const sexo = torneo.rama || torneo.sexo || 'Mixto';
      const categoria = torneo.categoria ? `Cat ${torneo.categoria}` : 'Cat a confirmar';

      return {
        ...torneo,
        inscritos,
        cuposMax,
        porcentajeOcupacion,
        isFull,
        estado,
        isTerminado,
        isEnProgreso,
        puedeVerCuadro,
        ventanaInscripcion,
        bloqueadoPorVentana,
        puedeInscribirse,
        miEstadoInscripcion,
        tieneInscripcionRegistrada,
        estadoTexto: etiquetaEstado(estado),
        modalidad,
        sexo,
        categoria,
        surfaceInfo,
      };
    });
  }, [torneos, misInscripcionesByTorneo]);

  const filtros = useMemo(() => {
    return [
      { id: 'todos', label: 'Todos', count: torneosView.length },
      { id: 'activos', label: 'Activos', count: torneosView.filter((t) => ESTADOS_ACTIVOS.has(t.estado)).length },
      { id: 'inscribibles', label: 'Inscripcion Abierta', count: torneosView.filter((t) => t.puedeInscribirse).length },
      { id: 'completos', label: 'Cupos Completos', count: torneosView.filter((t) => t.isFull).length },
      { id: 'finalizados', label: 'Finalizados', count: torneosView.filter((t) => t.isTerminado).length },
    ];
  }, [torneosView]);

  const torneosFiltrados = useMemo(() => {
    let lista = [...torneosView];

    if (estadoFiltro === 'activos') {
      lista = lista.filter((t) => ESTADOS_ACTIVOS.has(t.estado));
    }

    if (estadoFiltro === 'inscribibles') {
      lista = lista.filter((t) => t.puedeInscribirse);
    }

    if (estadoFiltro === 'completos') {
      lista = lista.filter((t) => t.isFull);
    }

    if (estadoFiltro === 'finalizados') {
      lista = lista.filter((t) => t.isTerminado);
    }

    const query = searchTerm.trim().toLowerCase();
    if (query) {
      lista = lista.filter((t) => [
        t.titulo,
        t.modalidad,
        t.sexo,
        t.categoria,
        t.surfaceInfo?.label,
      ].some((value) => String(value || '').toLowerCase().includes(query)));
    }

    if (orden === 'fecha_asc') {
      lista.sort((a, b) => new Date(a.fecha_inicio) - new Date(b.fecha_inicio));
    } else if (orden === 'cupos_desc') {
      lista.sort((a, b) => b.porcentajeOcupacion - a.porcentajeOcupacion);
    } else {
      lista.sort((a, b) => new Date(b.fecha_inicio) - new Date(a.fecha_inicio));
    }

    return lista;
  }, [torneosView, estadoFiltro, searchTerm, orden]);

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12 px-4">
        <div className="bg-red-50 text-red-600 p-4 rounded-lg inline-block">
          <p>{error}</p>
          <button onClick={fetchTorneosDisponibles} className="mt-2 text-sm underline font-medium hover:text-red-800">
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6 rounded-3xl bg-gradient-to-b from-[#f7fbff] via-[#f8fafc] to-[#f6f1df]">
      <div className="px-1 sm:px-2">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-[#0f4c81]">Torneos</h1>
            <p className="text-slate-600 mt-1">Cartelera completa con cupos, estado e inscripcion</p>
          </div>

          {isAdmin && (
            <button
              type="button"
              onClick={() => navigate(toClubPath('/admin'))}
              className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-[#0f4c81] to-[#d4af37] text-white px-4 py-2.5 text-sm font-bold shadow-sm hover:from-[#0b3c67] hover:to-[#b8962f] transition-colors"
            >
              Crear Nuevo Torneo
            </button>
          )}
        </div>
      </div>

      <div className="bg-gradient-to-br from-white via-slate-50 to-[#f8f3e3] border border-[#d5c086] rounded-2xl p-4 sm:p-5 mb-6 space-y-4 shadow-sm">
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
          <div className="flex-1">
            <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">Filtros</label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <IconSearch className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={searchDraft}
                  onChange={(event) => setSearchDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      setSearchTerm(searchDraft.trim());
                    }
                  }}
                  placeholder="Buscar por nombre, categoria o superficie"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-300 bg-white/90 focus:border-[#0f4c81] focus:ring-2 focus:ring-[#0f4c81]/20 outline-none"
                />
              </div>
              <button
                type="button"
                onClick={() => setSearchTerm(searchDraft.trim())}
                className="h-10 w-10 rounded-xl border border-slate-300 bg-white text-slate-600 hover:text-[#0f4c81] hover:border-[#0f4c81]/40 transition-colors inline-flex items-center justify-center"
                aria-label="Buscar"
              >
                <IconSearch className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="w-full lg:w-56">
            <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">Orden</label>
            <select
              value={orden}
              onChange={(event) => setOrden(event.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white/90 focus:border-[#0f4c81] focus:ring-2 focus:ring-[#0f4c81]/20 outline-none"
            >
              <option value="fecha_desc">Mas recientes primero</option>
              <option value="fecha_asc">Mas proximos primero</option>
              <option value="cupos_desc">Mayor ocupacion</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {filtros.map((filtro) => (
            <button
              key={filtro.id}
              onClick={() => setEstadoFiltro(filtro.id)}
              className={`px-3 py-2 rounded-xl border text-xs font-bold transition-colors ${
                estadoFiltro === filtro.id
                  ? 'bg-gradient-to-r from-[#0f4c81] to-[#d4af37] text-white border-[#0f4c81] shadow-sm shadow-[#0b1a2e]/20'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-[#f7fbff]'
              }`}
            >
              {filtro.label} ({filtro.count})
            </button>
          ))}
        </div>
      </div>

      ) : torneosFiltrados.length === 0 ? (
        <div className="text-center py-16 bg-gradient-to-br from-[#f8fbff] to-[#f2ead0] rounded-2xl border border-dashed border-[#d5c086]">
          <p className="text-slate-500 font-semibold">No hay torneos que coincidan con los filtros actuales.</p>
          <button
            onClick={() => {
              setSearchTerm('');
              setSearchDraft('');
              setEstadoFiltro('todos');
            }}
            className="mt-3 px-4 py-2 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-white"
          >
            Limpiar filtros
          </button>
        </div>
      ) : (
        <div className="space-y-8">
          {torneosFiltrados.map((torneo) => {
            return (
              <article key={torneo.id} className="group rounded-2xl shadow-md border border-slate-200 bg-gradient-to-b from-slate-50 to-white overflow-hidden mb-8 last:mb-0">
                <header className="relative h-44 sm:h-48 overflow-hidden">
                  <div
                    className="absolute inset-0"
                    style={{
                      backgroundImage: torneo.surfaceInfo.texture,
                      backgroundSize: torneo.surfaceInfo.textureSize,
                      backgroundPosition: 'center',
                    }}
                  />
                  <div className={`absolute inset-0 bg-gradient-to-r ${torneo.surfaceInfo.tintClass}`} />
                  <div className="absolute inset-0 backdrop-blur-[1.5px]" />
                  <div className="absolute inset-0 z-10 pointer-events-none opacity-100">
                    <CourtOverlay surfaceKey={torneo.surfaceInfo.key} />
                  </div>

                  <span className={`absolute top-4 right-4 z-20 text-[11px] font-bold px-3 py-1 rounded-full uppercase tracking-wide ${estadoVisual(torneo.estado)}`}>
                    {torneo.estadoTexto}
                  </span>

                  <div className="absolute inset-x-0 bottom-0 z-20 p-5 sm:p-6 text-white">
                    <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-white/85">
                      <IconCalendar className="h-4 w-4" />
                      {formatFechaTorneo(torneo.fecha_inicio)}
                    </p>
                    <h3 className="mt-2 text-xl sm:text-2xl font-black leading-tight drop-shadow-sm">
                      {torneo.titulo}
                    </h3>
                  </div>
                </header>

                <div className="grid gap-5 lg:gap-6 lg:grid-cols-[1fr_250px] p-5 sm:p-6">
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                      <DetailChip icon={IconTag} label="Categoria" value={torneo.categoria} />
                      <DetailChip icon={IconTennisBall} label="Modalidad" value={torneo.modalidad} />
                      <DetailChip
                        icon={String(torneo.sexo || '').toLowerCase().includes('dobles') || String(torneo.modalidad || '').toLowerCase().includes('dobles') ? IconUsers : IconUser}
                        label="Sexo"
                        value={torneo.sexo}
                      />
                      <DetailChip icon={IconCourt} label="Superficie" value={torneo.surfaceInfo.label} />
                      <DetailChip icon={IconCalendar} label="Inicio" value={formatFechaTorneo(torneo.fecha_inicio)} />
                    </div>

                    <div>
                      <div className="flex justify-between text-sm mb-1.5">
                        <span className="font-semibold text-slate-600">Ocupacion</span>
                        <span className="font-bold text-slate-900">{Math.round(torneo.porcentajeOcupacion)}%</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden pointer-events-none">
                        <div
                          className={`h-2.5 rounded-full ${progresoColor(torneo.porcentajeOcupacion)}`}
                          style={{ width: `${torneo.porcentajeOcupacion}%` }}
                        />
                      </div>

                      {torneo.isFull && torneo.puedeInscribirse && <p className="text-xs text-rose-600 font-semibold mt-2">Cupos aprobados completos. Tu solicitud quedará pendiente hasta validación.</p>}
                      {torneo.isTerminado && <p className="text-xs text-slate-600 font-semibold mt-2">Torneo disputado. Ver cuadro de resultados.</p>}
                      {torneo.isEnProgreso && <p className="text-xs text-indigo-700 font-semibold mt-2">Torneo en juego. Ver cuadro y cronograma en vivo.</p>}
                      {torneo.miEstadoInscripcion === INSCRIPTION_STATUS_PENDING && (
                        <p className="text-xs text-[#8f6a16] font-semibold mt-2">Tu inscripción está siendo revisada por el administrador.</p>
                      )}
                      {torneo.miEstadoInscripcion === INSCRIPTION_STATUS_APPROVED && (
                        <p className="text-xs text-emerald-700 font-semibold mt-2">Tu inscripción fue aprobada para este torneo.</p>
                      )}
                      {torneo.miEstadoInscripcion === INSCRIPTION_STATUS_REJECTED && (
                        <p className="text-xs text-rose-700 font-semibold mt-2">Tu solicitud fue rechazada. Contacta a la administración para más detalles.</p>
                      )}
                      {!torneo.isTerminado && torneo.bloqueadoPorVentana && torneo.ventanaInscripcion.message && (
                        <p className="text-xs text-[#8f6a16] font-semibold mt-2">{torneo.ventanaInscripcion.message}</p>
                      )}
                    </div>
                  </div>

                  <aside className="rounded-2xl border border-[#d5c086] bg-gradient-to-b from-white to-[#f8f3e3] p-4 sm:p-5 shadow-sm flex flex-col justify-between">
                    <div className="space-y-3">
                      <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-slate-500">Inscripcion</p>
                      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                        <p className="text-xs font-semibold text-slate-500">Inscriptos</p>
                        <p className="text-3xl font-black text-[#0f4c81] leading-none mt-1">
                          {torneo.inscritos}<span className="text-lg text-slate-400">/{torneo.cuposMax || '-'}</span>
                        </p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                        <p className="text-xs font-semibold text-slate-500">Costo</p>
                        <p className="text-lg font-black text-slate-900 mt-1">${Number(torneo.costo || 0).toLocaleString()}</p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                        <p className="text-xs font-semibold text-slate-500">Pendientes</p>
                        <p className="text-lg font-black text-[#8f6a16] mt-1">{Number(torneo.solicitudes_pendientes || 0)}</p>
                      </div>
                    </div>

                    {inscripcionStatus.id === torneo.id && inscripcionStatus.message && (
                      <div className={`mt-4 p-3 rounded-md text-sm border font-medium ${
                        inscripcionStatus.type === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                        inscripcionStatus.type === 'warning' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' :
                        'bg-red-50 text-red-700 border-red-200'
                      }`}>
                        {inscripcionStatus.message}
                      </div>
                    )}

                    <button
                      onClick={() => {
                        if (torneo.puedeVerCuadro) {
                          navigate(`/bracket/${torneo.id}`);
                          return;
                        }
                        abrirInscripcion(torneo);
                      }}
                      disabled={!torneo.puedeInscribirse && !torneo.puedeVerCuadro}
                      className={`
                        mt-4 w-full py-3 px-4 rounded-xl font-bold text-sm transition-all focus:outline-none focus:ring-2 focus:ring-offset-2
                        ${!torneo.puedeInscribirse && !torneo.puedeVerCuadro ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed' : ''}
                        ${torneo.isTerminado ? 'bg-slate-900 text-white hover:bg-slate-800 focus:ring-slate-500' : ''}
                        ${torneo.isEnProgreso ? 'bg-[#0f4c81] text-white hover:bg-[#0b1a2e] focus:ring-[#0f4c81]' : ''}
                        ${torneo.miEstadoInscripcion === INSCRIPTION_STATUS_PENDING ? 'bg-[#f3e7bf] text-[#8f6a16] border border-[#e1c774]' : ''}
                        ${torneo.miEstadoInscripcion === INSCRIPTION_STATUS_APPROVED ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : ''}
                        ${torneo.miEstadoInscripcion === INSCRIPTION_STATUS_REJECTED ? 'bg-rose-100 text-rose-700 border border-rose-200' : ''}
                        ${!torneo.isTerminado && torneo.puedeInscribirse && torneo.isFull ? 'bg-[#f3e7bf] text-[#8f6a16] hover:bg-[#ebd99c] focus:ring-[#d4af37] border border-[#e1c774]' : ''}
                        ${!torneo.puedeVerCuadro && torneo.puedeInscribirse && !torneo.isFull ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:from-emerald-400 hover:to-teal-400 focus:ring-emerald-400 shadow-sm shadow-emerald-900/20' : ''}
                      `}
                    >
                      {torneo.puedeVerCuadro
                        ? torneo.isEnProgreso
                          ? 'Ver cuadro y cronograma'
                          : 'Ver cuadro y resultados'
                        : torneo.bloqueadoPorVentana
                        ? (torneo.ventanaInscripcion.buttonLabel || 'Inscripcion no habilitada')
                        : torneo.miEstadoInscripcion === INSCRIPTION_STATUS_PENDING
                        ? 'Pendiente de aprobación'
                        : torneo.miEstadoInscripcion === INSCRIPTION_STATUS_APPROVED
                        ? 'Inscripción aprobada'
                        : torneo.miEstadoInscripcion === INSCRIPTION_STATUS_REJECTED
                        ? 'Solicitud rechazada'
                        : !torneo.puedeInscribirse
                        ? (textoBotonPorEstado[torneo.estado] || 'Inscripción no disponible')
                        : torneo.isFull
                          ? 'Solicitar inscripción'
                          : 'Inscribirme'}
                    </button>
                  </aside>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {torneoSeleccionado && (
        <InscripcionModal
          torneo={torneoSeleccionado}
          onClose={() => setTorneoSeleccionado(null)}
          onSuccess={(data) => {
            manejarInscripcionExitosa(torneoSeleccionado.id, data);
            setTorneoSeleccionado(null);
          }}
        />
      )}
    </div>
  );
}
