import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import TournamentBracket from './TournamentBracket';
import AdminLiveControl from './AdminLiveControl';

const DEFAULT_POINTS_BY_ROUND = {
  32: '5',
  16: '10',
  8: '25',
  4: '50',
  2: '100',
};
const DEFAULT_CHAMPION_POINTS = '100';

const ROUND_LABELS = {
  32: 'Primera Ronda (32)',
  16: 'Octavos (16)',
  8: 'Cuartos (8)',
  4: 'Semifinal (4)',
  2: 'Finalista (2)',
};

const CANCHA_SURFACE_OPTIONS = [
  { value: 'Polvo de ladrillo', label: 'Polvo de ladrillo' },
  { value: 'Cesped', label: 'Cesped' },
  { value: 'Cancha rapida', label: 'Cancha rapida' },
];

const DEFAULT_WHATSAPP_TEMPLATE = 'Hola {jugador}, te contacto por tu solicitud de inscripcion al {torneo}.';
const INTERNATIONAL_PHONE_REGEX = /^\+[1-9]\d{7,14}$/;

const normalizeCanchaSurface = (rawValue = '') => {
  const normalized = String(rawValue || '').trim().toLowerCase();
  if (!normalized) return '';

  if (normalized.includes('ladrillo') || normalized.includes('tierra') || normalized.includes('clay')) {
    return 'Polvo de ladrillo';
  }

  if (normalized.includes('cesped') || normalized.includes('grass') || normalized.includes('wimbledon') || normalized.includes('winbledom')) {
    return 'Cesped';
  }

  if (normalized.includes('rapida') || normalized.includes('rápida') || normalized.includes('fast')) {
    return 'Cancha rapida';
  }

  if (normalized.includes('cemento') || normalized.includes('hard') || normalized.includes('dura') || normalized.includes('us open')) {
    return 'Cancha rapida';
  }

  const exactMatch = CANCHA_SURFACE_OPTIONS.find((option) => option.value.toLowerCase() === normalized);
  return exactMatch ? exactMatch.value : '';
};

// Con inscripciones ilimitadas, siempre se muestran todas las rondas hasta 32
const DEFAULT_BRACKET_SIZE_FOR_FORM = 32;

const normalizeInternationalPhone = (rawValue = '') => {
  const text = String(rawValue || '');
  let result = '';

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (char === '+' && result.length === 0) {
      result += char;
      continue;
    }

    if (char >= '0' && char <= '9') {
      result += char;
    }
  }

  return result;
};

const getWhatsappPhoneMeta = (rawPhone) => {
  const normalized = normalizeInternationalPhone(rawPhone);
  if (!normalized) {
    return {
      isValid: false,
      normalized,
      waPhone: '',
      reason: 'El jugador no tiene telefono cargado.',
      hint: 'Debe cargarlo en formato internacional. Ejemplo: +5491122334455',
    };
  }

  if (!INTERNATIONAL_PHONE_REGEX.test(normalized)) {
    return {
      isValid: false,
      normalized,
      waPhone: '',
      reason: 'Telefono invalido para WhatsApp.',
      hint: 'Formato requerido: +codigo_pais + numero (solo digitos). Ejemplo: +5491122334455',
    };
  }

  return {
    isValid: true,
    normalized,
    waPhone: normalized.slice(1),
    reason: '',
    hint: '',
  };
};

const formatInscripcionDateForMessage = (rawDate) => {
  if (!rawDate) return 'sin fecha';

  const parsed = new Date(rawDate);
  if (Number.isNaN(parsed.getTime())) return String(rawDate);
  return parsed.toLocaleString();
};

const buildWhatsAppMessageFromTemplate = (template, inscripcion) => {
  const sourceTemplate = String(template || '').trim() || DEFAULT_WHATSAPP_TEMPLATE;
  const replacements = {
    '{jugador}': inscripcion?.jugador?.nombre_completo || 'jugador',
    '{torneo}': inscripcion?.torneo?.titulo || 'el torneo',
    '{telefono}': inscripcion?.jugador?.telefono || 'sin telefono',
    '{modalidad}': inscripcion?.torneo?.modalidad || '-',
    '{rama}': inscripcion?.torneo?.rama || '-',
    '{categoria}': String(inscripcion?.torneo?.categoria_id || '-'),
    '{fecha_solicitud}': formatInscripcionDateForMessage(inscripcion?.fecha_inscripcion),
  };

  return Object.entries(replacements).reduce(
    (message, [token, value]) => message.split(token).join(String(value)),
    sourceTemplate,
  );
};

const buildWhatsAppUrlForInscripcion = (inscripcion, template) => {
  const phoneMeta = getWhatsappPhoneMeta(inscripcion?.jugador?.telefono);
  if (!phoneMeta.isValid) return '';

  const message = encodeURIComponent(buildWhatsAppMessageFromTemplate(template, inscripcion));

  return `https://wa.me/${phoneMeta.waPhone}?text=${message}`;
};

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('canchas');
  const [canchas, setCanchas] = useState([]);
  const [loadingCanchas, setLoadingCanchas] = useState(true);
  const [canchaForm, setCanchaForm] = useState({
    nombre: '',
    tipo_superficie: '',
    descripcion: '',
    esta_disponible: true,
  });
  const [editingCanchaId, setEditingCanchaId] = useState(null);
  const [canchaCrudStatus, setCanchaCrudStatus] = useState({ loading: false, error: null, success: null });

  // Estados de torneos
  const [torneosConfigurados, setTorneosConfigurados] = useState([]);
  const [torneoSeleccionadoAdmin, setTorneoSeleccionadoAdmin] = useState(null);
  const [sorteoStatus, setSorteoStatus] = useState({ loading: false, message: null, type: null });
  const [inscripcionesPendientes, setInscripcionesPendientes] = useState([]);
  const [inscripcionesLoading, setInscripcionesLoading] = useState(false);
  const [inscripcionesStatus, setInscripcionesStatus] = useState({ message: null, type: null });
  const [whatsappTemplate, setWhatsappTemplate] = useState(DEFAULT_WHATSAPP_TEMPLATE);
  const [whatsappTemplateLoading, setWhatsappTemplateLoading] = useState(false);
  const [whatsappTemplateSaving, setWhatsappTemplateSaving] = useState(false);
  const [whatsappTemplateStatus, setWhatsappTemplateStatus] = useState({ message: null, type: null });

  const [torneoForm, setTorneoForm] = useState({
    titulo: '',
    rama: 'Masculino',
    modalidad: 'Singles',
    categoria: '3',
    costo: '',
    fecha_inicio: '',
    fecha_fin: '',
    fecha_inicio_inscripcion: '',
    fecha_cierre_inscripcion: '',
    canchas_asignadas: [],
    puntos_ronda_32: DEFAULT_POINTS_BY_ROUND[32],
    puntos_ronda_16: DEFAULT_POINTS_BY_ROUND[16],
    puntos_ronda_8: DEFAULT_POINTS_BY_ROUND[8],
    puntos_ronda_4: DEFAULT_POINTS_BY_ROUND[4],
    puntos_ronda_2: DEFAULT_POINTS_BY_ROUND[2],
    puntos_campeon: DEFAULT_CHAMPION_POINTS,
  });
  const [torneoStatus, setTorneoStatus] = useState({ loading: false, error: null, success: false });

  // Referencia a la conexion socket
  const [socket, setSocket] = useState(null);
  const pendingCount = inscripcionesPendientes.length;
  const whatsappPreviewMessage = useMemo(
    () => buildWhatsAppMessageFromTemplate(whatsappTemplate, inscripcionesPendientes[0] || null),
    [whatsappTemplate, inscripcionesPendientes],
  );

  useEffect(() => {
    // 1. Inicializar Socket.io
    const newSocket = io();
    setSocket(newSocket);

    // 2. Cargar canchas y torneos
    fetchCanchas();
    fetchTorneosAdmin();
    fetchInscripcionesPendientes();
    fetchWhatsappTemplateConfig();

    // 3. Escuchar eventos de cambios de cancha en tiempo real
    newSocket.on('estado_cancha_cambiado', (canchaActualizada) => {
      setCanchas(prevCanchas => 
        prevCanchas.map(c => c.id === canchaActualizada.id ? canchaActualizada : c)
      );
    });

    // 4. Refrescar solicitudes pendientes en tiempo real para badge/admin panel
    newSocket.on('inscripciones_pendientes_actualizadas', () => {
      fetchInscripcionesPendientes();
      fetchTorneosAdmin();
    });

    // Fallback por si se pierde algun evento de socket.
    const intervalId = setInterval(() => {
      fetchInscripcionesPendientes();
    }, 60000);

    return () => {
      clearInterval(intervalId);
      newSocket.disconnect();
    };
  }, []);

  const fetchTorneosAdmin = async () => {
    try {
       const { data } = await axios.get('/api/torneos/admin');
       setTorneosConfigurados(data);
    } catch (e) {
       console.error("Error obteniendo torneos para admin:", e);
    }
  };

  const fetchCanchas = async () => {
    try {
      setLoadingCanchas(true);
      const { data } = await axios.get('/api/canchas');
      setCanchas(data);
    } catch (err) {
      console.error('Error cargando canchas:', err);
    } finally {
      setLoadingCanchas(false);
    }
  };

  const fetchInscripcionesPendientes = async () => {
    try {
      setInscripcionesLoading(true);
      const { data } = await axios.get('/api/torneos/inscripciones/pendientes');
      setInscripcionesPendientes(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error cargando inscripciones pendientes:', err);
      setInscripcionesStatus({ message: 'No se pudieron cargar las solicitudes pendientes.', type: 'error' });
      setInscripcionesPendientes([]);
    } finally {
      setInscripcionesLoading(false);
    }
  };

  const fetchWhatsappTemplateConfig = async () => {
    try {
      setWhatsappTemplateLoading(true);
      const { data } = await axios.get('/api/torneos/inscripciones/whatsapp-template');
      const template = String(data?.template || '').trim() || DEFAULT_WHATSAPP_TEMPLATE;
      setWhatsappTemplate(template);
      setWhatsappTemplateStatus({ message: null, type: null });
    } catch (err) {
      console.error('Error cargando plantilla de WhatsApp:', err);
      setWhatsappTemplate(DEFAULT_WHATSAPP_TEMPLATE);
      setWhatsappTemplateStatus({
        message: err.response?.data?.error || 'No se pudo cargar la plantilla global de WhatsApp.',
        type: 'error',
      });
    } finally {
      setWhatsappTemplateLoading(false);
    }
  };

  const handleResolverInscripcion = async (inscripcionId, estadoObjetivo) => {
    const esRechazo = estadoObjetivo === 'rechazada';
    const motivo = esRechazo
      ? (window.prompt('Motivo del rechazo (opcional):', '') || '').trim()
      : '';

    setInscripcionesStatus({ message: null, type: null });

    try {
      await axios.patch(`/api/torneos/inscripciones/${inscripcionId}/estado`, {
        estado_inscripcion: estadoObjetivo,
        motivo_rechazo: esRechazo ? motivo : null,
      });

      setInscripcionesStatus({
        message: estadoObjetivo === 'aprobada'
          ? 'Solicitud aprobada correctamente.'
          : 'Solicitud rechazada correctamente.',
        type: 'success',
      });

      await Promise.all([fetchInscripcionesPendientes(), fetchTorneosAdmin()]);
    } catch (err) {
      setInscripcionesStatus({
        message: err.response?.data?.error || 'No se pudo actualizar el estado de la solicitud.',
        type: 'error',
      });
    }
  };

  const persistWhatsappTemplate = async (templateValue) => {
    const normalizedTemplate = String(templateValue || '').trim();
    if (!normalizedTemplate) {
      setWhatsappTemplateStatus({ message: 'El mensaje no puede estar vacio.', type: 'error' });
      return false;
    }

    try {
      setWhatsappTemplateSaving(true);
      const { data } = await axios.patch('/api/torneos/inscripciones/whatsapp-template', {
        template: normalizedTemplate,
      });

      const persistedTemplate = String(data?.template || '').trim() || DEFAULT_WHATSAPP_TEMPLATE;
      setWhatsappTemplate(persistedTemplate);
      setWhatsappTemplateStatus({ message: 'Plantilla global guardada correctamente.', type: 'success' });
      return true;
    } catch (err) {
      setWhatsappTemplateStatus({
        message: err.response?.data?.error || 'No se pudo guardar la plantilla global de WhatsApp.',
        type: 'error',
      });
      return false;
    } finally {
      setWhatsappTemplateSaving(false);
    }
  };

  const handleGuardarWhatsappTemplate = async () => {
    await persistWhatsappTemplate(whatsappTemplate);
  };

  const handleRestablecerWhatsappTemplate = async () => {
    setWhatsappTemplate(DEFAULT_WHATSAPP_TEMPLATE);
    await persistWhatsappTemplate(DEFAULT_WHATSAPP_TEMPLATE);
  };

  const toggleCanchaEstado = async (cancha) => {
    try {
      // Optimistic update
      const nuevoEstado = !cancha.esta_disponible;
      setCanchas(prev => prev.map(c => c.id === cancha.id ? { ...c, esta_disponible: nuevoEstado } : c));
      
      // Llamada al backend
      await axios.put(`/api/canchas/${cancha.id}/estado`, {
        esta_disponible: nuevoEstado
      });

    } catch (err) {
      console.error('Error cambiando estado de cancha', err);
      // Revertir optimistic update si hay error
      fetchCanchas(); 
    }
  };

  const resetCanchaForm = () => {
    setCanchaForm({
      nombre: '',
      tipo_superficie: '',
      descripcion: '',
      esta_disponible: true,
    });
    setEditingCanchaId(null);
  };

  const handleCanchaFormChange = (e) => {
    const { name, value, type, checked } = e.target;
    setCanchaForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleEditCancha = (cancha) => {
    setEditingCanchaId(cancha.id);
    setCanchaForm({
      nombre: cancha.nombre || '',
      tipo_superficie: normalizeCanchaSurface(cancha.tipo_superficie || ''),
      descripcion: cancha.descripcion || '',
      esta_disponible: Boolean(cancha.esta_disponible),
    });
    setCanchaCrudStatus({ loading: false, error: null, success: null });
  };

  const handleDeleteCancha = async (canchaId) => {
    const confirmar = window.confirm('¿Seguro que deseas eliminar esta cancha? Esta acción no se puede deshacer.');
    if (!confirmar) return;

    setCanchaCrudStatus({ loading: true, error: null, success: null });
    try {
      await axios.delete(`/api/canchas/${canchaId}`);
      await fetchCanchas();
      if (editingCanchaId === canchaId) {
        resetCanchaForm();
      }
      setCanchaCrudStatus({ loading: false, error: null, success: 'Cancha eliminada correctamente.' });
    } catch (err) {
      setCanchaCrudStatus({
        loading: false,
        error: err.response?.data?.error || 'No se pudo eliminar la cancha.',
        success: null,
      });
    }
  };

  const handleCanchaSubmit = async (e) => {
    e.preventDefault();
    setCanchaCrudStatus({ loading: true, error: null, success: null });

    try {
      const superficieNormalizada = normalizeCanchaSurface(canchaForm.tipo_superficie);
      if (!superficieNormalizada) {
        setCanchaCrudStatus({
          loading: false,
          error: 'Selecciona una superficie valida para la cancha.',
          success: null,
        });
        return;
      }

      const payload = {
        nombre: canchaForm.nombre.trim(),
        tipo_superficie: superficieNormalizada,
        descripcion: canchaForm.descripcion.trim(),
        esta_disponible: Boolean(canchaForm.esta_disponible),
      };

      if (editingCanchaId) {
        await axios.put(`/api/canchas/${editingCanchaId}`, payload);
      } else {
        await axios.post('/api/canchas', payload);
      }

      await fetchCanchas();
      resetCanchaForm();
      setCanchaCrudStatus({
        loading: false,
        error: null,
        success: editingCanchaId ? 'Cancha actualizada correctamente.' : 'Cancha creada correctamente.',
      });
    } catch (err) {
      setCanchaCrudStatus({
        loading: false,
        error: err.response?.data?.error || 'No se pudo guardar la cancha.',
        success: null,
      });
    }
  };

  const handleToggleCanchaAsignada = (canchaId) => {
    setTorneoForm((prev) => {
      const alreadySelected = prev.canchas_asignadas.includes(canchaId);
      return {
        ...prev,
        canchas_asignadas: alreadySelected
          ? prev.canchas_asignadas.filter((id) => id !== canchaId)
          : [...prev.canchas_asignadas, canchaId],
      };
    });
  };

  const handleTorneoChange = (e) => {
    setTorneoForm({
      ...torneoForm,
      [e.target.name]: e.target.value
    });
  };

  const handleTorneoSubmit = async (e) => {
    e.preventDefault();
    setTorneoStatus({ loading: true, error: null, success: false });

    if (!torneoForm.fecha_inicio_inscripcion || !torneoForm.fecha_cierre_inscripcion) {
      setTorneoStatus({
        loading: false,
        error: 'Debes definir inicio y cierre de inscripciones.',
        success: false
      });
      return;
    }

    if (new Date(torneoForm.fecha_cierre_inscripcion) < new Date(torneoForm.fecha_inicio_inscripcion)) {
      setTorneoStatus({
        loading: false,
        error: 'La fecha de cierre de inscripciones no puede ser anterior al inicio de inscripciones.',
        success: false
      });
      return;
    }

    if (new Date(torneoForm.fecha_cierre_inscripcion) > new Date(torneoForm.fecha_inicio)) {
      setTorneoStatus({
        loading: false,
        error: 'El cierre de inscripciones no puede ser posterior al inicio del torneo.',
        success: false
      });
      return;
    }

    if (new Date(torneoForm.fecha_fin) < new Date(torneoForm.fecha_inicio)) {
      setTorneoStatus({
        loading: false,
        error: 'La fecha de fin no puede ser anterior a la fecha de inicio.',
        success: false
      });
      return;
    }

    try {
      await axios.post('/api/torneos', {
        ...torneoForm,
        rama: torneoForm.rama,
        sexo: torneoForm.rama,
        modalidad: torneoForm.modalidad,
        categoria: parseInt(torneoForm.categoria, 10),
        costo: parseFloat(torneoForm.costo),
        puntos_ronda_32: parseInt(torneoForm.puntos_ronda_32 || '0', 10),
        puntos_ronda_16: parseInt(torneoForm.puntos_ronda_16 || '0', 10),
        puntos_ronda_8: parseInt(torneoForm.puntos_ronda_8 || '0', 10),
        puntos_ronda_4: parseInt(torneoForm.puntos_ronda_4 || '0', 10),
        puntos_ronda_2: parseInt(torneoForm.puntos_ronda_2 || '0', 10),
        puntos_campeon: parseInt(torneoForm.puntos_campeon || '0', 10),
        puntos_por_ronda: {
          32: parseInt(torneoForm.puntos_ronda_32 || '0', 10),
          16: parseInt(torneoForm.puntos_ronda_16 || '0', 10),
          8: parseInt(torneoForm.puntos_ronda_8 || '0', 10),
          4: parseInt(torneoForm.puntos_ronda_4 || '0', 10),
          2: parseInt(torneoForm.puntos_ronda_2 || '0', 10),
          1: parseInt(torneoForm.puntos_campeon || '0', 10),
        },
        canchas_asignadas: torneoForm.canchas_asignadas,
        canchas_ids: torneoForm.canchas_asignadas,
      });
      
      setTorneoStatus({ loading: false, error: null, success: true });
      setTorneoForm({
        titulo: '',
        rama: 'Masculino',
        modalidad: 'Singles',
        categoria: '3',
        costo: '',
        fecha_inicio: '',
        fecha_fin: '',
        fecha_inicio_inscripcion: '',
        fecha_cierre_inscripcion: '',
        canchas_asignadas: [],
        puntos_ronda_32: DEFAULT_POINTS_BY_ROUND[32],
        puntos_ronda_16: DEFAULT_POINTS_BY_ROUND[16],
        puntos_ronda_8: DEFAULT_POINTS_BY_ROUND[8],
        puntos_ronda_4: DEFAULT_POINTS_BY_ROUND[4],
        puntos_ronda_2: DEFAULT_POINTS_BY_ROUND[2],
        puntos_campeon: DEFAULT_CHAMPION_POINTS,
      });
      fetchTorneosAdmin(); // Recargar lista al crear
      
      // Ocultar mensaje de éxito después de 3 segundos
      setTimeout(() => setTorneoStatus(prev => ({ ...prev, success: false })), 3000);
    } catch (err) {
      setTorneoStatus({ 
        loading: false, 
        error: err.response?.data?.error || 'Ocurrió un error al crear el torneo', 
        success: false 
      });
    }
  };

  const handleGenerarSorteo = async () => {
    if (!torneoSeleccionadoAdmin) return;
    
    setSorteoStatus({ loading: true, message: null, type: null });
    try {
      const { data } = await axios.post(`/api/torneos/${torneoSeleccionadoAdmin}/sorteo`);
      setSorteoStatus({ loading: false, message: data.message, type: 'success' });
      
      // Refrescar el componente CuadroTorneo forzando un re-render
      // Cambiando brevemente el id y regresando (un truco sucio pero rápido)
      const idReal = torneoSeleccionadoAdmin;
      setTorneoSeleccionadoAdmin(null);
      setTimeout(() => setTorneoSeleccionadoAdmin(idReal), 50);

    } catch (err) {
      setSorteoStatus({ 
        loading: false, 
        message: err.response?.data?.error || 'Error al generar sorteo automático', 
        type: 'error' 
      });
    }
  };

  const canchasDisponibles = canchas.filter((cancha) => cancha.esta_disponible);
  // Sin cupos máximos: siempre se muestran todas las rondas en la configuración de puntos
  const bracketSizeByCupos = DEFAULT_BRACKET_SIZE_FOR_FORM;
  const roundsToConfigure = [32, 16, 8, 4, 2];

  const TAB_ITEMS = [
    { id: 'canchas', label: 'Canchas' },
    { id: 'torneos', label: 'Creacion de Torneo' },
    { id: 'inscripciones', label: 'Gestion de Inscripciones' },
    { id: 'cuadros', label: 'Cuadros y Cronogramas' },
    { id: 'live-control', label: 'Control en Vivo' },
  ];

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-8">
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 sm:p-6 flex flex-wrap gap-2">
          {TAB_ITEMS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-lg text-sm font-bold border transition-colors ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              <span className="inline-flex items-center gap-2">
                <span>{tab.label}</span>
                {tab.id === 'inscripciones' && pendingCount > 0 && (
                  <span className="inline-flex min-w-[1.35rem] items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[11px] font-black leading-none text-white">
                    {pendingCount}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
      </section>

      {activeTab === 'canchas' && (
        <>
          {/* Sección: Gestión de Canchas (Tiempo Real) */}
          <section>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-3xl font-bold text-gray-900">Estado de Canchas</h2>
              <div className="flex items-center space-x-2 text-sm">
                <span className="flex items-center"><span className="w-3 h-3 rounded-full bg-emerald-500 mr-2"></span> Disponible</span>
                <span className="flex items-center"><span className="w-3 h-3 rounded-full bg-red-500 mr-2"></span> Ocupada/Mantenimiento</span>
              </div>
            </div>

            {loadingCanchas ? (
              <div className="flex justify-center items-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {canchas.map(cancha => (
                  <button
                    key={cancha.id}
                    type="button"
                    onClick={() => toggleCanchaEstado(cancha)}
                    className={`
                      flex items-center gap-2.5 rounded-xl border-2 cursor-pointer px-3 py-3 sm:px-4 sm:py-4
                      transition-all duration-200 hover:shadow-md active:scale-95 text-left w-full
                      ${cancha.esta_disponible
                        ? 'bg-emerald-50 border-emerald-200 hover:border-emerald-300'
                        : 'bg-red-50 border-red-200 hover:border-red-300'}
                    `}
                  >
                    <span className={`shrink-0 h-3 w-3 rounded-full shadow-inner ${cancha.esta_disponible ? 'bg-emerald-500' : 'bg-red-500'}`} />
                    <div className="min-w-0">
                      <p className={`text-sm font-bold truncate ${cancha.esta_disponible ? 'text-emerald-900' : 'text-red-900'}`}>
                        {cancha.nombre}
                      </p>
                      <p className={`hidden sm:block text-xs font-medium mt-0.5 ${cancha.esta_disponible ? 'text-emerald-600' : 'text-red-600'}`}>
                        {cancha.esta_disponible ? 'Activa y lista' : 'Fuera de servicio'}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* Sección: Gestionar Canchas */}
          <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-6 sm:p-8 space-y-8">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Gestionar Canchas</h2>
                  <p className="text-sm text-gray-500 mt-1">Alta, edición y baja de canchas del club.</p>
                </div>
                {editingCanchaId && (
                  <button
                    type="button"
                    onClick={resetCanchaForm}
                    className="px-4 py-2 text-sm font-semibold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    Cancelar edición
                  </button>
                )}
              </div>

              <form onSubmit={handleCanchaSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 border border-gray-100 rounded-xl p-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Nombre</label>
                  <input
                    type="text"
                    name="nombre"
                    value={canchaForm.nombre}
                    onChange={handleCanchaFormChange}
                    placeholder="Ej. Cancha Central"
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Superficie</label>
                  <select
                    name="tipo_superficie"
                    value={canchaForm.tipo_superficie}
                    onChange={handleCanchaFormChange}
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  >
                    <option value="">Seleccionar superficie...</option>
                    {CANCHA_SURFACE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Descripción</label>
                  <textarea
                    name="descripcion"
                    value={canchaForm.descripcion}
                    onChange={handleCanchaFormChange}
                    rows={2}
                    placeholder="Información adicional de la cancha"
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <label className="inline-flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <input
                    type="checkbox"
                    name="esta_disponible"
                    checked={canchaForm.esta_disponible}
                    onChange={handleCanchaFormChange}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  Disponible para torneos
                </label>

                <div className="md:col-span-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={canchaCrudStatus.loading}
                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-60"
                  >
                    {canchaCrudStatus.loading ? 'Guardando...' : editingCanchaId ? 'Guardar cambios' : 'Agregar cancha'}
                  </button>
                </div>
              </form>

              {canchaCrudStatus.error && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm font-medium">
                  {canchaCrudStatus.error}
                </div>
              )}

              {canchaCrudStatus.success && (
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-medium">
                  {canchaCrudStatus.success}
                </div>
              )}

              {loadingCanchas ? (
                <div className="text-sm text-gray-500">Cargando canchas...</div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {canchas.map((cancha) => (
                    <div key={`gestion-${cancha.id}`} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="font-bold text-gray-900">{cancha.nombre}</h3>
                          <p className="text-sm text-gray-600">{cancha.tipo_superficie || 'Sin superficie definida'}</p>
                        </div>
                        <span className={`text-xs font-bold px-2 py-1 rounded-full ${cancha.esta_disponible ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                          {cancha.esta_disponible ? 'Disponible' : 'No disponible'}
                        </span>
                      </div>

                      {cancha.descripcion && (
                        <p className="text-xs text-gray-500">{cancha.descripcion}</p>
                      )}

                      <div className="flex items-center gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => handleEditCancha(cancha)}
                          className="flex-1 px-3 py-2 text-sm font-semibold rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteCancha(cancha.id)}
                          className="flex-1 px-3 py-2 text-sm font-semibold rounded-lg border border-red-200 text-red-700 hover:bg-red-50"
                        >
                          Eliminar
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleCanchaEstado(cancha)}
                          className="px-3 py-2 text-sm font-semibold rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
                          title="Cambiar disponibilidad"
                        >
                          {cancha.esta_disponible ? 'Desactivar' : 'Activar'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </>
      )}

      {activeTab === 'torneos' && (
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 sm:p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Configurar Nuevo Torneo</h2>
          
          <form onSubmit={handleTorneoSubmit} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              
              <div className="sm:col-span-2">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Título del Torneo</label>
                <input
                  type="text"
                  name="titulo"
                  value={torneoForm.titulo}
                  onChange={handleTorneoChange}
                  placeholder="Ej. Torneo de Verano 2026 - Categoría A"
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Rama</label>
                <select
                  name="rama"
                  value={torneoForm.rama}
                  onChange={handleTorneoChange}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  required
                >
                  <option value="Masculino">Masculino</option>
                  <option value="Femenino">Femenino</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Modalidad</label>
                <select
                  name="modalidad"
                  value={torneoForm.modalidad}
                  onChange={handleTorneoChange}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  required
                >
                  <option value="Singles">Singles</option>
                  <option value="Dobles">Dobles</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Categoría</label>
                <select
                  name="categoria"
                  value={torneoForm.categoria}
                  onChange={handleTorneoChange}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  required
                >
                  <option value="1">1ª</option>
                  <option value="2">2ª</option>
                  <option value="3">3ª</option>
                  <option value="4">4ª</option>
                  <option value="5">5ª</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Puntos por ronda (ranking)</label>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {roundsToConfigure.map((roundOrder) => {
                    const fieldName = `puntos_ronda_${roundOrder}`;
                    return (
                      <div key={`puntos-${roundOrder}`}>
                        <label className="block text-xs font-bold uppercase tracking-wide text-gray-500 mb-1">
                          {ROUND_LABELS[roundOrder] || `Ronda ${roundOrder}`}
                        </label>
                        <input
                          type="number"
                          min="0"
                          name={fieldName}
                          value={torneoForm[fieldName]}
                          onChange={handleTorneoChange}
                          className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                          required
                        />
                      </div>
                    );
                  })}
                  <div key="puntos-campeon">
                    <label className="block text-xs font-bold uppercase tracking-wide text-gray-500 mb-1">
                      Campeon
                    </label>
                    <input
                      type="number"
                      min="0"
                      name="puntos_campeon"
                      value={torneoForm.puntos_campeon}
                      onChange={handleTorneoChange}
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                      required
                    />
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Cada jugador conserva los puntos de la ronda maxima alcanzada. El campeon usa el valor de "Campeon".
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Costo Inscripción ($)</label>
                <input
                  type="number"
                  name="costo"
                  value={torneoForm.costo}
                  onChange={handleTorneoChange}
                  min="0"
                  step="0.01"
                  placeholder="Ej. 15000"
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Fecha de Inicio (Torneo)</label>
                <input
                  type="datetime-local"
                  name="fecha_inicio"
                  value={torneoForm.fecha_inicio}
                  onChange={handleTorneoChange}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Fecha de Fin</label>
                <input
                  type="datetime-local"
                  name="fecha_fin"
                  value={torneoForm.fecha_fin}
                  onChange={handleTorneoChange}
                  min={torneoForm.fecha_inicio || undefined}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Inicio de Inscripciones</label>
                <input
                  type="datetime-local"
                  name="fecha_inicio_inscripcion"
                  value={torneoForm.fecha_inicio_inscripcion}
                  onChange={handleTorneoChange}
                  max={torneoForm.fecha_cierre_inscripcion || torneoForm.fecha_inicio || undefined}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Cierre de Inscripciones</label>
                <input
                  type="datetime-local"
                  name="fecha_cierre_inscripcion"
                  value={torneoForm.fecha_cierre_inscripcion}
                  onChange={handleTorneoChange}
                  min={torneoForm.fecha_inicio_inscripcion || undefined}
                  max={torneoForm.fecha_inicio || undefined}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  required
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Canchas asignadas a este torneo</label>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  {canchasDisponibles.length === 0 ? (
                    <p className="text-sm text-gray-500">No hay canchas disponibles para asignar.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {canchasDisponibles.map((cancha) => (
                        <label key={`torneo-cancha-${cancha.id}`} className="inline-flex items-start gap-2 text-sm text-gray-700">
                          <input
                            type="checkbox"
                            checked={torneoForm.canchas_asignadas.includes(cancha.id)}
                            onChange={() => handleToggleCanchaAsignada(cancha.id)}
                            className="h-4 w-4 mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span>
                            <span className="font-semibold">{cancha.nombre}</span>
                            <span className="text-xs text-gray-500 block">{cancha.tipo_superficie || 'Superficie no definida'}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>

            </div>

            {torneoStatus.error && (
              <div className="p-4 bg-red-50 border-l-4 border-red-500 text-red-700 rounded-r-md">
                <p className="font-medium">Error al crear</p>
                <p className="text-sm">{torneoStatus.error}</p>
              </div>
            )}

            {torneoStatus.success && (
              <div className="p-4 bg-emerald-50 border-l-4 border-emerald-500 text-emerald-700 rounded-r-md">
                <p className="font-medium">¡Éxito!</p>
                <p className="text-sm">El torneo ha sido creado correctamente y está abierto para inscripciones.</p>
              </div>
            )}

            <div className="pt-4 border-t border-gray-100 flex justify-end">
              <button
                type="submit"
                disabled={torneoStatus.loading}
                className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-sm hover:shadow transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center"
              >
                {torneoStatus.loading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Procesando...
                  </>
                ) : (
                  'Publicar Torneo'
                )}
              </button>
            </div>
          </form>
        </div>
      </section>
      )}

      {activeTab === 'inscripciones' && (
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-6 sm:p-8 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Validacion de Inscripciones</h2>
                <p className="text-sm text-gray-500 mt-1">Aprueba o rechaza solicitudes pendientes de los jugadores.</p>
              </div>
              <button
                type="button"
                onClick={fetchInscripcionesPendientes}
                className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Actualizar
              </button>
            </div>

            {inscripcionesStatus.message && (
              <div className={`p-3 rounded-lg border text-sm font-medium ${
                inscripcionesStatus.type === 'success'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-red-50 text-red-700 border-red-200'
              }`}>
                {inscripcionesStatus.message}
              </div>
            )}

            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 sm:p-5 space-y-3">
              <div>
                <h3 className="text-sm font-bold text-gray-900">Mensaje de WhatsApp</h3>
                <p className="text-xs text-gray-500 mt-1">
                  Configuracion global compartida entre administradores.
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Variables disponibles: {'{jugador}'}, {'{torneo}'}, {'{telefono}'}, {'{modalidad}'}, {'{rama}'}, {'{categoria}'}, {'{fecha_solicitud}'}
                </p>
              </div>

              <textarea
                value={whatsappTemplate}
                onChange={(e) => {
                  setWhatsappTemplate(e.target.value);
                  setWhatsappTemplateStatus({ message: null, type: null });
                }}
                rows={3}
                disabled={whatsappTemplateLoading || whatsappTemplateSaving}
                className="w-full rounded-lg border border-gray-300 bg-white p-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Escribe el mensaje para WhatsApp"
              />

              <p className="text-xs text-gray-500">
                {whatsappTemplateLoading ? 'Cargando plantilla global...' : `Vista previa: ${whatsappPreviewMessage}`}
              </p>

              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                <button
                  type="button"
                  onClick={handleGuardarWhatsappTemplate}
                  disabled={whatsappTemplateLoading || whatsappTemplateSaving}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {whatsappTemplateSaving ? 'Guardando...' : 'Guardar mensaje'}
                </button>
                <button
                  type="button"
                  onClick={handleRestablecerWhatsappTemplate}
                  disabled={whatsappTemplateLoading || whatsappTemplateSaving}
                  className="px-4 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-100 text-gray-700 text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  Restablecer mensaje base
                </button>
              </div>

              {whatsappTemplateStatus.message && (
                <div className={`p-2.5 rounded-lg border text-xs font-medium ${
                  whatsappTemplateStatus.type === 'success'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-red-50 text-red-700 border-red-200'
                }`}>
                  {whatsappTemplateStatus.message}
                </div>
              )}
            </div>

            {inscripcionesLoading ? (
              <div className="text-sm text-gray-500">Cargando solicitudes pendientes...</div>
            ) : inscripcionesPendientes.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-6 text-center text-sm text-gray-600">
                No hay solicitudes pendientes por validar.
              </div>
            ) : (
              <div className="space-y-4">
                {inscripcionesPendientes.map((inscripcion) => {
                  const whatsappUrl = buildWhatsAppUrlForInscripcion(inscripcion, whatsappTemplate);
                  const telefono = inscripcion?.jugador?.telefono || '';
                  const phoneMeta = getWhatsappPhoneMeta(telefono);

                  return (
                  <article key={inscripcion.id} className={`rounded-xl border p-4 sm:p-5 ${inscripcion.estado_inscripcion === 'pendiente_baja' ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-gray-50'}`}>
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                      <div className="space-y-1">
                        {inscripcion.estado_inscripcion === 'pendiente_baja' && (
                          <span className="inline-block text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-200 text-amber-800 mb-1">
                            Solicitud de Baja
                          </span>
                        )}
                        <p className="text-sm font-bold text-gray-900">{inscripcion.torneo?.titulo || 'Torneo sin titulo'}</p>
                        <p className="text-sm text-gray-700">Jugador: <span className="font-semibold">{inscripcion.jugador?.nombre_completo || inscripcion.jugador_id}</span></p>
                        <p className="text-xs text-gray-500">Telefono: {telefono || 'No disponible'}</p>
                        {!phoneMeta.isValid && (
                          <p className="text-xs text-rose-600">{phoneMeta.reason} {phoneMeta.hint}</p>
                        )}
                        <p className="text-xs text-gray-500">Modalidad: {inscripcion.torneo?.modalidad || '-'} | Rama: {inscripcion.torneo?.rama || '-'} | Categoria: {inscripcion.torneo?.categoria_id || '-'}</p>
                        <p className="text-xs text-gray-500">Solicitada: {inscripcion.fecha_inscripcion ? new Date(inscripcion.fecha_inscripcion).toLocaleString() : 'Sin fecha'}</p>
                        {inscripcion.estado_inscripcion === 'pendiente_baja' && inscripcion.motivo_rechazo && (
                          <p className="text-xs text-amber-800 font-semibold mt-1">Motivo: {inscripcion.motivo_rechazo}</p>
                        )}
                      </div>

                      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                        {inscripcion.estado_inscripcion === 'pendiente_baja' ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleResolverInscripcion(inscripcion.id, 'rechazada')}
                              className="px-5 py-2.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold transition-colors"
                            >
                              Aprobar Baja
                            </button>
                            <button
                              type="button"
                              onClick={() => handleResolverInscripcion(inscripcion.id, 'aprobada')}
                              className="px-5 py-2.5 rounded-lg bg-gray-500 hover:bg-gray-600 text-white text-sm font-bold transition-colors"
                            >
                              Rechazar Baja
                            </button>
                          </>
                        ) : (
                          <>
                            {whatsappUrl ? (
                              <a
                                href={whatsappUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="px-5 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold transition-colors text-center"
                              >
                                WhatsApp
                              </a>
                            ) : (
                              <button
                                type="button"
                                disabled
                                className="px-5 py-2.5 rounded-lg bg-gray-200 text-gray-500 text-sm font-bold cursor-not-allowed"
                                title={`${phoneMeta.reason} ${phoneMeta.hint}`.trim()}
                              >
                                WhatsApp
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleResolverInscripcion(inscripcion.id, 'aprobada')}
                              className="px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold transition-colors"
                            >
                              Validar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleResolverInscripcion(inscripcion.id, 'rechazada')}
                              className="px-5 py-2.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold transition-colors"
                            >
                              Rechazar
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      )}

      {activeTab === 'cuadros' && (
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mt-2 mb-12">
         <div className="p-6 sm:p-8 bg-gradient-to-r from-gray-800 to-gray-900">
           <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
             <div>
                <h2 className="text-2xl font-bold text-white mb-2">Generador Automático de Cuadros</h2>
                 <p className="text-gray-300 text-sm">El algoritmo cruzará la lista de inscritos ordenados por puntos de ranking y buscará un hueco de disponibilidad horaria común para programar el encuentro automáticamente.</p>
             </div>
             
             <div className="flex flex-col gap-3 w-full md:w-auto md:min-w-[340px]">
               <select 
                 className="p-3 rounded-lg border-none bg-white text-gray-800 focus:ring-2 focus:ring-blue-500 font-medium w-full"
                 value={torneoSeleccionadoAdmin || ''}
                 onChange={(e) => setTorneoSeleccionadoAdmin(e.target.value)}
               >
                 <option value="" disabled>1. Selecciona un Torneo...</option>
                 {torneosConfigurados.map(t => (
                   <option key={t.id} value={t.id}>{t.titulo} ({t.inscritos} inscriptos)</option>
                 ))}
               </select>

               <button
                 onClick={handleGenerarSorteo}
                 disabled={!torneoSeleccionadoAdmin || sorteoStatus.loading}
                 className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold shadow transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
               >
                 {sorteoStatus.loading ? 'Generando...' : '2. Generar Sorteo'}
               </button>
             </div>
           </div>

           {sorteoStatus.message && (
             <div className={`mt-4 p-3 rounded-lg font-medium text-sm border ${
               sorteoStatus.type === 'success' ? 'bg-emerald-800 border-emerald-600 text-emerald-100' : 'bg-red-800 border-red-600 text-red-100'
             }`}>
                {sorteoStatus.message}
             </div>
           )}
         </div>

         {/* Visualizador del Bracket del Torneo Seleccionado */}
         <div className="p-6 sm:p-8">
            {torneoSeleccionadoAdmin ? (
               <TournamentBracket torneoId={torneoSeleccionadoAdmin} adminMode />
            ) : (
               <div className="text-center py-12 text-gray-400 font-medium border-2 border-dashed border-gray-100 rounded-xl">
                 Selecciona un torneo arriba para visualizar las llaves de partidos.
               </div>
            )}
         </div>
      </section>
      )}

      {activeTab === 'live-control' && (
        <AdminLiveControl torneos={torneosConfigurados} />
      )}

    </div>
  );
}
