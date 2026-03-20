import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { PROFILE_PHOTO_BUCKET, resolveProfilePhotoUrl } from '../lib/profilePhoto';
import {
  IconAlertTriangle,
  IconChartBars,
  IconCheckCircle,
  IconHand,
  IconLock,
  IconPin,
  IconRacket,
  IconRuler,
  IconSave,
  IconScale,
  IconSettings,
  IconStarFill,
  IconTag,
  IconTennisBall,
  IconTrophy,
  IconUser,
  IconXCircle,
} from './icons/UiIcons';

const API_URL = '';
const MAX_PROFILE_PHOTO_SIZE_MB = 5;
const PROFILE_UPDATED_EVENT = 'tennisflow:profile-updated';
const PROFILE_UPDATED_STORAGE_KEY = 'tennisflow:profile-updated';
const INTERNATIONAL_PHONE_REGEX = /^\+[1-9]\d{7,14}$/;

const normalizePhoneInput = (rawValue = '') => {
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

const broadcastProfileUpdated = (userId) => {
  const normalizedId = String(userId || '').trim();
  if (!normalizedId || typeof window === 'undefined') return;

  const payload = {
    userId: normalizedId,
    updatedAt: Date.now(),
  };

  window.dispatchEvent(new CustomEvent(PROFILE_UPDATED_EVENT, { detail: payload }));

  try {
    window.localStorage.setItem(PROFILE_UPDATED_STORAGE_KEY, JSON.stringify(payload));
  } catch (_) {
    // Ignore storage sync errors (private mode or unavailable storage).
  }
};

const getRankingRows = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.jugadores)) return payload.jugadores;
  return [];
};

const toSafeInt = (value, fallback = 0) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(parsed) ? parsed : fallback;
};

const getCategoriaBadgeClasses = (categoria) => {
  if (categoria === 1) return 'text-amber-800 border-amber-300';
  if (categoria === 2) return 'text-sky-800 border-sky-300';
  if (categoria === 3) return 'text-blue-800 border-blue-300';
  if (categoria === 4) return 'text-indigo-800 border-indigo-300';
  if (categoria === 5) return 'text-slate-700 border-slate-300';
  return 'text-slate-700 border-slate-300';
};

const safeRevokeObjectUrl = (url) => {
  if (url && typeof url === 'string' && url.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
};

const buildFileName = (file) => {
  const ext = (file.name?.split('.').pop() || 'jpg').toLowerCase();
  const uniqueId = globalThis.crypto?.randomUUID?.()
    || `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  return `${uniqueId}.${ext}`;
};

async function uploadProfilePhoto({ userId, file }) {
  const filePath = `${userId}/${buildFileName(file)}`;
  const { error } = await supabase.storage
    .from(PROFILE_PHOTO_BUCKET)
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type,
    });

  if (error) {
    throw new Error(error.message || 'No se pudo subir la foto de perfil.');
  }

  const { data } = supabase.storage.from(PROFILE_PHOTO_BUCKET).getPublicUrl(filePath);
  return data?.publicUrl || '';
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function InputField({
  label,
  id,
  type = 'text',
  value,
  onChange,
  placeholder,
  suffix,
  required = false,
  pattern,
  title,
  inputMode,
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold text-gray-700 mb-1">{label}</label>
      <div className="relative">
        <input id={id} type={type} value={value || ''} onChange={onChange} placeholder={placeholder}
          required={required}
          pattern={pattern}
          title={title}
          inputMode={inputMode}
          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-400/50 focus:border-emerald-400 transition-all text-gray-800 bg-white" />
        {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">{suffix}</span>}
      </div>
    </div>
  );
}

function SelectField({ label, id, value, onChange, options, disabled = false }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold text-gray-700 mb-1">{label}</label>
      <select
        id={id}
        value={value || ''}
        onChange={onChange}
        disabled={disabled}
        className={`w-full border border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-400/50 focus:border-emerald-400 transition-all text-gray-800 bg-white appearance-none ${disabled ? 'opacity-70 cursor-not-allowed bg-slate-50' : ''}`}
      >
        <option value="">Seleccionar...</option>
        {options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
      </select>
    </div>
  );
}

function PhysicalStatCard({ icon, label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
      <div className="text-slate-500 mb-1">{icon}</div>
      <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="text-[28px] sm:text-xl font-black text-slate-900 leading-tight mt-1">{value}</p>
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

// ── Tab Mi Actividad ──────────────────────────────────────────────────────────
function MiActividad({ userId }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rivalesPorId, setRivalesPorId] = useState({});

  useEffect(() => {
    if (!userId) return;
    axios.get(`${API_URL}/api/dashboard?jugador_id=${userId}`)
      .then(({ data }) => setStats(data.estadisticas_jugador))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId]);

  useEffect(() => {
    const rivalIds = Object.keys(stats?.h2h || {});
    if (rivalIds.length === 0) {
      setRivalesPorId({});
      return;
    }

    let activo = true;

    const resolverNombres = async () => {
      const resultados = await Promise.allSettled(
        rivalIds.map(async (rivalId) => {
          const { data } = await axios.get(`${API_URL}/api/perfil/${rivalId}`);
          const nombre = data?.nombre_completo
            || [data?.nombre, data?.apellido].filter(Boolean).join(' ').trim();
          return [rivalId, nombre || `${rivalId.slice(0, 8)}...`];
        })
      );

      if (!activo) return;

      const nextMap = {};
      resultados.forEach((resultado, idx) => {
        const rivalId = rivalIds[idx];
        if (resultado.status === 'fulfilled') {
          const [id, nombre] = resultado.value;
          nextMap[id] = nombre;
        } else {
          nextMap[rivalId] = `${rivalId.slice(0, 8)}...`;
        }
      });

      setRivalesPorId(nextMap);
    };

    resolverNombres();

    return () => {
      activo = false;
    };
  }, [stats?.h2h]);

  if (loading) return <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-emerald-400 border-t-transparent rounded-full animate-spin" /></div>;

  if (!stats || stats.total_partidos === 0) return (
    <div className="text-center py-16 text-gray-400">
      <div className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 p-4 mb-3 text-slate-500">
        <IconTennisBall className="h-10 w-10" />
      </div>
      <p className="font-bold">Todavía no jugaste ningún partido</p>
      <p className="text-sm mt-1">¡Inscribite a un torneo para empezar tu historial!</p>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Stats rápidas */}
      <div className="grid grid-cols-3 sm:grid-cols-3 gap-3">
        {[
          { icon: IconTennisBall, label: 'Partidos', value: stats.total_partidos, color: 'from-blue-500 to-indigo-600' },
          { icon: IconTrophy, label: 'Victorias', value: stats.victorias, color: 'from-emerald-500 to-teal-600' },
          { icon: IconChartBars, label: 'Efectividad', value: `${stats.win_rate}%`, color: 'from-amber-500 to-orange-500' },
        ].map(s => (
          <div key={s.label} className={`bg-gradient-to-br ${s.color} rounded-2xl p-4 text-white shadow-sm`}>
            <div className="mb-1 opacity-90"><s.icon className="h-6 w-6" /></div>
            <div className="text-2xl font-black">{s.value}</div>
            <div className="text-xs opacity-80">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Barra W/L visual */}
      <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
        <p className="text-sm font-bold text-gray-700 mb-3">Ratio Victorias / Derrotas</p>
        <div className="flex h-3 rounded-full overflow-hidden gap-0.5">
          <div className="bg-emerald-400 transition-all rounded-l-full"
            style={{ width: `${stats.win_rate}%` }} />
          <div className="bg-red-300 flex-1 rounded-r-full" />
        </div>
        <div className="flex justify-between mt-2 text-xs text-gray-400">
          <span className="inline-flex items-center gap-1 text-emerald-600"><IconCheckCircle className="h-3.5 w-3.5" /> {stats.victorias} victorias</span>
          <span className="inline-flex items-center gap-1 text-rose-500"><IconXCircle className="h-3.5 w-3.5" /> {stats.derrotas} derrotas</span>
        </div>
      </div>

      {/* H2H */}
      {Object.keys(stats.h2h || {}).length > 0 && (
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <p className="text-sm font-bold text-gray-700 mb-3">Head to Head</p>
          <div className="space-y-2">
            {Object.entries(stats.h2h).map(([rival_id, record]) => (
              <div key={rival_id} className="flex items-center gap-3 text-sm">
                <div className="w-8 h-8 bg-gradient-to-br from-gray-400 to-gray-500 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-xs font-bold">?</span>
                </div>
                <div className="flex-1 text-xs text-gray-500 truncate">{rivalesPorId[rival_id] || `${rival_id.slice(0, 8)}...`}</div>
                <span className="font-black text-emerald-600">{record.victorias}</span>
                <span className="text-gray-400">-</span>
                <span className="font-black text-red-400">{record.derrotas}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Componente Principal ──────────────────────────────────────────────────────
const TABS = [
  { id: 'perfil', label: 'Mi Perfil', icon: IconUser },
  { id: 'actividad', label: 'Mi Actividad', icon: IconChartBars },
];

export default function MiPerfil() {
  const {
    user,
    refreshPerfil,
    isAdminReal,
    viewAsJugador,
    setViewAsJugador,
  } = useAuth();
  const [activeTab, setActiveTab] = useState('perfil');
  const [form, setForm] = useState({
    nombre_completo: '', apellido: '', telefono: '', localidad: '', foto_url: '',
    sexo: 'Masculino',
    mano_dominante: 'Diestro', estilo_reves: '1 mano',
    altura: '', peso: '', categoria_singles: '3', categoria_dobles: '3',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState('');
  const [photoDisplayUrl, setPhotoDisplayUrl] = useState('');
  const [photoLoadFailed, setPhotoLoadFailed] = useState(false);
  const [status, setStatus] = useState(null);
  const [rankingPreview, setRankingPreview] = useState({ singles: null, dobles: null });
  const [quickStats, setQuickStats] = useState({ total_partidos: 0, victorias: 0, derrotas: 0, win_rate: 0 });
  const [passwordForm, setPasswordForm] = useState({ nueva: '', confirmar: '' });
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordStatus, setPasswordStatus] = useState(null);

  useEffect(() => {
    if (!user?.id) return;
    axios.get(`${API_URL}/api/perfil/${user.id}`)
      .then(async ({ data }) => {
        setForm({
          nombre_completo: data.nombre_completo || '',
          apellido: data.apellido || '',
          telefono: data.telefono || '',
          localidad: data.localidad || '',
          foto_url: data.foto_url || '',
          sexo: data.sexo || 'Masculino',
          mano_dominante: data.mano_dominante || 'Diestro',
          estilo_reves: data.estilo_reves || '1 mano',
          altura: data.altura || '',
          peso: data.peso || '',
          categoria_singles: (data.categoria_singles ?? data.categoria ?? 3).toString(),
          categoria_dobles: (data.categoria_dobles ?? 3).toString(),
        });
        setSelectedPhoto(null);
        setPhotoLoadFailed(false);
        const resolved = await resolveProfilePhotoUrl(data.foto_url || '');
        setPhotoDisplayUrl(resolved);
        setPhotoPreviewUrl((prev) => {
          safeRevokeObjectUrl(prev);
          return '';
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  useEffect(() => () => {
    safeRevokeObjectUrl(photoPreviewUrl);
  }, [photoPreviewUrl]);

  useEffect(() => {
    if (!user?.id || loading) return;

    let active = true;

    const fetchPreviewData = async () => {
      const sexo = form.sexo || 'Masculino';
      const categoriaSingles = String(form.categoria_singles || '3');
      const categoriaDobles = String(form.categoria_dobles || '3');

      const [statsRes, singlesRes, doblesRes] = await Promise.allSettled([
        axios.get(`${API_URL}/api/dashboard`, { params: { jugador_id: user.id } }),
        axios.get(`${API_URL}/api/rankings`, {
          params: { modalidad: 'Singles', sexo, categoria: categoriaSingles },
        }),
        axios.get(`${API_URL}/api/rankings`, {
          params: { modalidad: 'Dobles', sexo, categoria: categoriaDobles },
        }),
      ]);

      if (!active) return;

      if (statsRes.status === 'fulfilled') {
        const stats = statsRes.value?.data?.estadisticas_jugador || {};
        const total = toSafeInt(stats?.total_partidos, 0);
        const victorias = toSafeInt(stats?.victorias, 0);
        const derrotas = toSafeInt(stats?.derrotas, Math.max(total - victorias, 0));
        const winRate = total > 0 ? Math.round((victorias / total) * 100) : 0;

        setQuickStats({
          total_partidos: total,
          victorias,
          derrotas,
          win_rate: toSafeInt(stats?.win_rate, winRate),
        });
      }

      const resolvePosicion = (response) => {
        if (response.status !== 'fulfilled') return null;
        const rows = getRankingRows(response.value?.data);
        const idx = rows.findIndex((row) => String(row?.id || row?.jugador_id) === String(user.id));
        return idx >= 0 ? idx + 1 : null;
      };

      setRankingPreview({
        singles: resolvePosicion(singlesRes),
        dobles: resolvePosicion(doblesRes),
      });
    };

    fetchPreviewData().catch(() => {
      if (!active) return;
      setRankingPreview({ singles: null, dobles: null });
    });

    return () => {
      active = false;
    };
  }, [user?.id, loading, form.sexo, form.categoria_singles, form.categoria_dobles]);

  const handleChange = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));

  const handlePhotoSelected = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setStatus({ type: 'error', msg: 'Selecciona un archivo de imagen valido (JPG, PNG, WEBP).' });
      return;
    }

    const maxBytes = MAX_PROFILE_PHOTO_SIZE_MB * 1024 * 1024;
    if (file.size > maxBytes) {
      setStatus({ type: 'error', msg: `La foto supera ${MAX_PROFILE_PHOTO_SIZE_MB}MB.` });
      return;
    }

    const nextPreviewUrl = URL.createObjectURL(file);
    setPhotoLoadFailed(false);
    setPhotoPreviewUrl((prev) => {
      safeRevokeObjectUrl(prev);
      return nextPreviewUrl;
    });
    setSelectedPhoto(file);
    setStatus(null);
  };

  const handleRemovePhoto = () => {
    setPhotoPreviewUrl((prev) => {
      safeRevokeObjectUrl(prev);
      return '';
    });
    setPhotoDisplayUrl('');
    setPhotoLoadFailed(false);
    setSelectedPhoto(null);
    setForm((prev) => ({ ...prev, foto_url: '' }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const telefonoNormalizado = normalizePhoneInput(form.telefono);
    if (!INTERNATIONAL_PHONE_REGEX.test(telefonoNormalizado)) {
      setStatus({
        type: 'error',
        msg: 'Ingresa un teléfono en formato internacional. Ejemplo: +5491122334455',
      });
      return;
    }

    setSaving(true); setStatus(null);

    try {
      let fotoUrlFinal = form.foto_url;

      if (selectedPhoto) {
        setUploadingPhoto(true);
        fotoUrlFinal = await uploadProfilePhoto({ userId: user.id, file: selectedPhoto });
      }

      const canEditCategorias = isAdminReal && !viewAsJugador;
      const {
        categoria_singles: categoriaSinglesForm,
        categoria_dobles: categoriaDoblesForm,
        ...baseForm
      } = form;

      const payload = {
        ...baseForm,
        telefono: telefonoNormalizado,
        foto_url: fotoUrlFinal,
      };

      if (canEditCategorias) {
        payload.categoria = parseInt(categoriaSinglesForm, 10);
        payload.categoria_singles = parseInt(categoriaSinglesForm, 10);
        payload.categoria_dobles = parseInt(categoriaDoblesForm, 10);
      }

      await axios.put(`${API_URL}/api/perfil/${user.id}`, payload);

      await refreshPerfil?.();

      const resolved = await resolveProfilePhotoUrl(fotoUrlFinal || '');
      setForm((prev) => ({ ...prev, foto_url: fotoUrlFinal }));
      setPhotoDisplayUrl(resolved);
      setPhotoLoadFailed(false);
      setPhotoPreviewUrl((prev) => {
        safeRevokeObjectUrl(prev);
        return '';
      });
      setSelectedPhoto(null);
      broadcastProfileUpdated(user.id);
      setStatus({ type: 'success', msg: '¡Perfil actualizado correctamente!' });
    } catch (err) {
      const rawMessage = err.response?.data?.error || err.message || '';
      let friendlyMessage = rawMessage || 'Error al guardar.';

      if (/Bucket not found/i.test(rawMessage)) {
        friendlyMessage = `No se encontro el bucket '${PROFILE_PHOTO_BUCKET}' en este proyecto de Supabase.`;
      } else if (/row-level security|permission|not authorized|unauthorized/i.test(rawMessage)) {
        friendlyMessage = 'No hay permisos para subir al bucket. Revisa las policies de Storage para usuarios autenticados.';
      }

      setStatus({
        type: 'error',
        msg: friendlyMessage,
      });
    } finally {
      setUploadingPhoto(false);
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    setPasswordStatus(null);

    const nueva = String(passwordForm.nueva || '');
    const confirmar = String(passwordForm.confirmar || '');

    if (!nueva || nueva.length < 8) {
      setPasswordStatus({ type: 'error', msg: 'La nueva contrasena debe tener al menos 8 caracteres.' });
      return;
    }

    if (nueva !== confirmar) {
      setPasswordStatus({ type: 'error', msg: 'La confirmacion de contrasena no coincide.' });
      return;
    }

    setChangingPassword(true);

    try {
      const { error } = await supabase.auth.updateUser({ password: nueva });

      if (error) {
        throw error;
      }

      setPasswordForm({ nueva: '', confirmar: '' });
      setPasswordStatus({ type: 'success', msg: 'Contrasena actualizada correctamente.' });
    } catch (err) {
      setPasswordStatus({
        type: 'error',
        msg: err?.message || 'No se pudo actualizar la contrasena. Intenta nuevamente.',
      });
    } finally {
      setChangingPassword(false);
    }
  };

  if (!user) return (
    <div className="text-center py-20 text-gray-500">
      <div className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 p-4 mb-4 text-slate-600">
        <IconLock className="h-10 w-10" />
      </div>
      <p className="font-semibold">Debés iniciar sesión para ver tu perfil</p>
    </div>
  );

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="w-10 h-10 border-4 border-emerald-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const iniciales = form.nombre_completo
    ? form.nombre_completo.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  const fotoMostrada = photoPreviewUrl || photoDisplayUrl || form.foto_url;
  const canEditCategorias = isAdminReal && !viewAsJugador;
  const categoriaSingles = toSafeInt(form.categoria_singles, 0);
  const categoriaDobles = toSafeInt(form.categoria_dobles, 0);
  const partidosJugados = toSafeInt(quickStats.total_partidos, 0);
  const victorias = toSafeInt(quickStats.victorias, 0);
  const winRate = Math.max(0, Math.min(100, toSafeInt(quickStats.win_rate, 0)));
  const victoriasPercent = partidosJugados > 0 ? Math.round((victorias / partidosJugados) * 100) : 0;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="relative px-4 sm:px-6 pt-4 sm:pt-5 pb-16 sm:pb-20 bg-gradient-to-r from-slate-950 via-blue-900 to-sky-800 text-white">
          <div
            className="absolute inset-0 opacity-20 pointer-events-none"
            style={{ backgroundImage: 'repeating-linear-gradient(135deg, rgba(255,255,255,0.16) 0px, rgba(255,255,255,0.16) 1px, transparent 1px, transparent 14px)' }}
          />
          <div className="absolute -right-8 -top-8 text-[130px] leading-none text-amber-200/10 pointer-events-none">★</div>

          <div className="relative z-10 ml-24 sm:ml-52 pr-6">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-sky-100/80">Mi ficha de jugador</p>
            <h1 className="mt-1 text-2xl sm:text-4xl font-black leading-[1.02]">{form.nombre_completo || 'Mi Perfil'}</h1>
            <p className="mt-1 text-sm sm:text-base text-sky-100 truncate">{user.email}</p>
            <p className="mt-1 text-sm text-sky-100 inline-flex items-center gap-1.5 truncate">
              <IconPin className="h-4 w-4 text-amber-200" />
              <span>{form.localidad || 'Sin localidad'}</span>
            </p>
          </div>

          <div className="absolute left-4 sm:left-6 -bottom-11 sm:-bottom-16 z-20">
            <div className="h-24 w-24 sm:h-40 sm:w-40 rounded-full p-[3px] bg-gradient-to-br from-[#f7e9aa] via-[#d4af37] to-[#8f6a16] shadow-[0_14px_24px_rgba(15,23,42,0.32)]">
              <div className="h-full w-full rounded-full p-[4px] bg-gradient-to-br from-[#f4e8bf] to-[#d1ac43]">
                <div className="h-full w-full rounded-full overflow-hidden ring-2 ring-[#f9f0d0] bg-slate-100">
                  {fotoMostrada && !photoLoadFailed ? (
                    <img
                      src={fotoMostrada}
                      alt="Foto"
                      onError={() => setPhotoLoadFailed(true)}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full w-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-black text-xl sm:text-3xl flex items-center justify-center">
                      {iniciales}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="absolute -bottom-1 -right-1 h-7 w-7 bg-emerald-400 rounded-full border-2 border-white flex items-center justify-center">
              <IconCheckCircle className="h-4 w-4 text-white" />
            </div>
          </div>

          <div className="relative z-10 mt-4 ml-24 sm:ml-52 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-white/25 bg-white/15 px-3 py-1 text-xs font-black text-white">
              <IconTag className="h-3.5 w-3.5 text-amber-200" />
              Singles {form.categoria_singles}a
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-white/25 bg-white/15 px-3 py-1 text-xs font-black text-white">
              <IconTennisBall className="h-3.5 w-3.5 text-cyan-200" />
              Dobles {form.categoria_dobles}a
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-white/25 bg-white/15 px-3 py-1 text-xs font-black text-white">
              <IconUser className="h-3.5 w-3.5" />
              {form.sexo || 'Sin dato'}
            </span>
          </div>
        </div>

        <div className="relative bg-white px-4 sm:px-6 pt-14 sm:pt-16 pb-5 space-y-4">
          <div className="absolute left-3 top-20 h-8 w-8 border border-amber-200/70 rounded-sm pointer-events-none opacity-70" />
          <div className="absolute right-4 top-28 h-8 w-8 border border-sky-200/80 rounded-sm pointer-events-none opacity-70" />

          <div className="rounded-2xl border border-slate-200 overflow-hidden shadow-md relative z-10">
            <div className="grid grid-cols-1 md:grid-cols-2">
              <div className="px-3 sm:px-4 py-3 bg-gradient-to-r from-[#9b7422] via-[#d9b857] to-[#f2df9c] text-slate-950">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#0b3f73] to-[#012849] text-2xl flex items-center justify-center shadow text-amber-300">
                    <IconStarFill className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-[11px] sm:text-xs font-black uppercase tracking-[0.16em] text-slate-900/80">Ranking Singles</p>
                    <p className="text-4xl sm:text-[46px] leading-none font-black mt-1">
                      {rankingPreview.singles ? `#${rankingPreview.singles}` : '---'}
                    </p>
                    <span className={`mt-2 inline-flex rounded-full border bg-white/90 px-2.5 py-1 text-xs font-black ${getCategoriaBadgeClasses(categoriaSingles)}`}>
                      Categoria {form.categoria_singles || '-'}a
                    </span>
                  </div>
                </div>
              </div>

              <div className="px-3 sm:px-4 py-3 bg-gradient-to-r from-[#0e3157] via-[#1a5689] to-[#2f8ec6] text-white border-t border-white/20 md:border-t-0 md:border-l md:border-white/25">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-xl bg-white/20 border border-white/25 flex items-center justify-center shadow">
                    <IconTrophy className="h-5 w-5 text-amber-200" />
                  </div>
                  <div>
                    <p className="text-[11px] sm:text-xs font-black uppercase tracking-[0.16em] text-sky-100">Ranking Dobles</p>
                    <p className="text-4xl sm:text-[46px] leading-none font-black mt-1">
                      {rankingPreview.dobles ? `#${rankingPreview.dobles}` : '---'}
                    </p>
                    <span className={`mt-2 inline-flex rounded-full border bg-white/95 px-2.5 py-1 text-xs font-black ${getCategoriaBadgeClasses(categoriaDobles)}`}>
                      Categoria {form.categoria_dobles || '-'}a
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-3">
            <p className="text-sm font-black uppercase tracking-[0.14em] text-slate-700 mb-2.5">Rendimiento actual</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-xl bg-white border border-slate-200 px-3 py-2.5">
                <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500 font-black">Partidos jugados</p>
                <p className="text-2xl font-black text-slate-900 mt-1">{partidosJugados}</p>
              </div>

              <div className="rounded-xl bg-white border border-slate-200 px-3 py-2.5 flex items-center justify-between gap-2">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500 font-black">Victorias</p>
                  <p className="text-2xl font-black text-slate-900 mt-1">{victorias}</p>
                </div>
                <StatRing percent={victoriasPercent} label={`${victoriasPercent}%`} />
              </div>

              <div className="rounded-xl bg-white border border-slate-200 px-3 py-2.5 flex items-center justify-between gap-2">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500 font-black">Efectividad</p>
                  <p className="text-2xl font-black text-slate-900 mt-1">{winRate}%</p>
                </div>
                <StatRing percent={winRate} label="Win" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-1 bg-slate-100 border border-slate-200 p-1.5 rounded-2xl">
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2.5 text-sm font-bold rounded-xl transition-all ${
              activeTab === tab.id ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'
            }`}>
            <span className="inline-flex items-center gap-1.5">
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </span>
          </button>
        ))}
      </div>

      {isAdminReal && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-black text-slate-800 inline-flex items-center gap-1.5">
                <IconSettings className="h-4 w-4 text-[#0f4c81]" />
                Ver como Jugador
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Oculta temporalmente accesos y herramientas de administracion para navegar de forma limpia.
              </p>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={viewAsJugador}
              onClick={() => setViewAsJugador((prev) => !prev)}
              className={`relative inline-flex h-8 w-14 items-center rounded-full border transition-colors ${
                viewAsJugador
                  ? 'bg-[#0f4c81] border-[#0f4c81]'
                  : 'bg-slate-200 border-slate-300'
              }`}
            >
              <span
                className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform ${
                  viewAsJugador ? 'translate-x-7' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {viewAsJugador && (
            <p className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-800">
              Modo Jugador activo: las herramientas de edicion de admin estan ocultas hasta que desactives este switch.
            </p>
          )}
        </div>
      )}

      {activeTab === 'perfil' && (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
              <h2 className="text-lg font-black text-slate-800 mb-5 flex items-center gap-2">
                <span className="w-8 h-8 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center">
                  <IconUser className="h-4 w-4" />
                </span>
                Datos Personales
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InputField label="Nombre" id="nombre_completo" value={form.nombre_completo} onChange={handleChange('nombre_completo')} placeholder="Roger" />
                <InputField label="Apellido" id="apellido" value={form.apellido} onChange={handleChange('apellido')} placeholder="Federer" />
                <div>
                  <InputField
                    label="Telefono / WhatsApp"
                    id="telefono"
                    type="tel"
                    value={form.telefono}
                    onChange={(e) => setForm((prev) => ({ ...prev, telefono: normalizePhoneInput(e.target.value) }))}
                    placeholder="+5491122334455"
                    required
                    inputMode="tel"
                    pattern="^\+[1-9]\d{7,14}$"
                    title="Usa formato internacional con + y solo numeros. Ej: +5491122334455"
                  />
                  <p className="mt-1 text-[11px] text-slate-500">Formato requerido: +codigo_pais + numero (solo digitos). Ejemplo: +5491122334455</p>
                </div>
                <SelectField label="Sexo" id="sexo" value={form.sexo} onChange={handleChange('sexo')}
                  options={[{ value: 'Masculino', label: 'Caballeros' }, { value: 'Femenino', label: 'Damas' }]} />
                <div className="sm:col-span-2">
                  <InputField label="Localidad / Ciudad" id="localidad" value={form.localidad} onChange={handleChange('localidad')} placeholder="Buenos Aires, Argentina" />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="foto_local" className="block text-sm font-semibold text-slate-700 mb-1">Foto de Perfil</label>
                  <div className="border border-slate-200 rounded-xl p-3 bg-white">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <input
                        id="foto_local"
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/jpg"
                        onChange={handlePhotoSelected}
                        className="block w-full text-sm text-slate-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-emerald-100 file:text-emerald-700 hover:file:bg-emerald-200"
                      />
                      <button
                        type="button"
                        onClick={handleRemovePhoto}
                        disabled={!fotoMostrada && !selectedPhoto}
                        className="px-3 py-2 text-sm font-semibold rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Quitar foto
                      </button>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">Formato: JPG, PNG o WEBP. Tamano maximo: {MAX_PROFILE_PHOTO_SIZE_MB}MB.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
              <h2 className="text-lg font-black text-slate-800 mb-5 flex items-center gap-2">
                <span className="w-8 h-8 bg-emerald-100 text-emerald-600 rounded-lg flex items-center justify-center">
                  <IconSettings className="h-4 w-4" />
                </span>
                Datos Tecnicos
              </h2>

              <div className="grid grid-cols-2 sm:grid-cols-2 gap-3 mb-4">
                <PhysicalStatCard icon={<IconRuler className="h-5 w-5" />} label="Altura" value={form.altura ? `${form.altura} cm` : 'Sin dato'} />
                <PhysicalStatCard icon={<IconScale className="h-5 w-5" />} label="Peso" value={form.peso ? `${form.peso} kg` : 'Sin dato'} />
                <PhysicalStatCard icon={<IconHand className="h-5 w-5" />} label="Mano" value={form.mano_dominante || 'Sin dato'} />
                <PhysicalStatCard icon={<IconRacket className="h-5 w-5" />} label="Reves" value={form.estilo_reves || 'Sin dato'} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <SelectField label="Mano Dominante" id="mano_dominante" value={form.mano_dominante} onChange={handleChange('mano_dominante')}
                  options={[{ value: 'Diestro', label: 'Diestro' }, { value: 'Zurdo', label: 'Zurdo' }]} />
                <SelectField label="Estilo de Reves" id="estilo_reves" value={form.estilo_reves} onChange={handleChange('estilo_reves')}
                  options={[{ value: '1 mano', label: '1 Mano' }, { value: '2 manos', label: '2 Manos' }]} />
                <InputField label="Altura" id="altura" type="number" value={form.altura} onChange={handleChange('altura')} placeholder="175" suffix="cm" />
                <InputField label="Peso" id="peso" type="number" value={form.peso} onChange={handleChange('peso')} placeholder="70" suffix="kg" />
                <SelectField label="Categoria Singles" id="categoria_singles" value={form.categoria_singles} onChange={handleChange('categoria_singles')}
                  disabled={!canEditCategorias}
                  options={[
                    { value: '1', label: 'Nivel 1 - Elite' },
                    { value: '2', label: 'Nivel 2 - Avanzado' },
                    { value: '3', label: 'Nivel 3 - Intermedio' },
                    { value: '4', label: 'Nivel 4 - Intermedio Bajo' },
                    { value: '5', label: 'Nivel 5 - Principiante' },
                  ]} />
                <SelectField label="Categoria Dobles" id="categoria_dobles" value={form.categoria_dobles} onChange={handleChange('categoria_dobles')}
                  disabled={!canEditCategorias}
                  options={[
                    { value: '1', label: 'Nivel 1 - Elite' },
                    { value: '2', label: 'Nivel 2 - Avanzado' },
                    { value: '3', label: 'Nivel 3 - Intermedio' },
                    { value: '4', label: 'Nivel 4 - Intermedio Bajo' },
                    { value: '5', label: 'Nivel 5 - Principiante' },
                  ]} />
                {!canEditCategorias && (
                  <div className="col-span-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 inline-flex items-center gap-1.5">
                    <IconLock className="h-3.5 w-3.5" />
                    Solo los administradores pueden cambiar tus categorías.
                  </div>
                )}
              </div>
            </div>
          </div>

          {status && (
            <div className={`p-4 rounded-xl text-sm font-semibold ${
              status.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-red-50 border border-red-200 text-red-600'
            } inline-flex items-start gap-2`}>
              {status.type === 'success'
                ? <IconCheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                : <IconAlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />}
              <span>{status.msg}</span>
            </div>
          )}

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <h3 className="text-base font-black text-slate-800 inline-flex items-center gap-2">
              <IconLock className="h-4 w-4 text-slate-600" />
              Cambiar Contrasena
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InputField
                label="Nueva contrasena"
                id="nueva_contrasena"
                type="password"
                value={passwordForm.nueva}
                onChange={(e) => setPasswordForm((prev) => ({ ...prev, nueva: e.target.value }))}
                placeholder="Minimo 8 caracteres"
              />
              <InputField
                label="Confirmar contrasena"
                id="confirmar_contrasena"
                type="password"
                value={passwordForm.confirmar}
                onChange={(e) => setPasswordForm((prev) => ({ ...prev, confirmar: e.target.value }))}
                placeholder="Repite la nueva contrasena"
              />
            </div>

            {passwordStatus && (
              <div className={`p-3 rounded-xl text-sm font-semibold ${
                passwordStatus.type === 'success'
                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                  : 'bg-red-50 border border-red-200 text-red-600'
              } inline-flex items-start gap-2`}>
                {passwordStatus.type === 'success'
                  ? <IconCheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  : <IconAlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />}
                <span>{passwordStatus.msg}</span>
              </div>
            )}

            <button
              type="button"
              disabled={changingPassword}
              onClick={handleChangePassword}
              className="w-full sm:w-auto px-5 py-2.5 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-colors disabled:opacity-60"
            >
              {changingPassword ? 'Actualizando contrasena...' : 'Actualizar contrasena'}
            </button>
          </div>

          <button type="submit" disabled={saving}
            className="w-full py-3.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-black rounded-2xl hover:from-emerald-400 hover:to-teal-400 transition-all shadow-lg shadow-emerald-900/20 disabled:opacity-60 text-base">
            {saving ? (uploadingPhoto ? 'Subiendo foto...' : 'Guardando...') : (
              <span className="inline-flex items-center gap-1.5">
                <IconSave className="h-4 w-4" />
                Guardar Cambios
              </span>
            )}
          </button>
        </form>
      )}

      {activeTab === 'actividad' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5">
          <MiActividad userId={user?.id} />
        </div>
      )}
    </div>
  );
}
