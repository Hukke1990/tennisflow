import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { DEFAULT_CLUB_SLUG, buildClubPath } from '../context/ClubContext';

const API_URL = '';

const PLAN_OPTIONS = [
  { value: 'test',    label: 'Test (gratis)',  color: 'text-slate-300' },
  { value: 'basico',  label: 'Básico',         color: 'text-sky-300' },
  { value: 'pro',     label: 'Pro',            color: 'text-violet-300' },
  { value: 'premium', label: 'Premium',        color: 'text-amber-300' },
];

const slugify = (value = '') => String(value || '')
  .trim()
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9\s-]/g, '')
  .replace(/\s+/g, '-')
  .replace(/-+/g, '-')
  .replace(/^-|-$/g, '');

const isValidEmail = (value = '') => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());

const planBadgeClass = (plan) => {
  const map = { test: 'bg-slate-500/20 text-slate-300', basico: 'bg-sky-500/15 text-sky-300', pro: 'bg-violet-500/15 text-violet-300', premium: 'bg-amber-500/15 text-amber-300' };
  return map[plan] ?? 'bg-white/10 text-slate-400';
};

// ── Componente: fila de club con inline plan selector ─────────────────────────
function ClubRow({ club, onUpdated }) {
  const [open, setOpen]             = useState(false);
  const [plan, setPlan]             = useState(club.plan ?? 'basico');
  const [saving, setSaving]         = useState(false);
  const [msg, setMsg]               = useState('');
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [revoking, setRevoking]     = useState(false);

  const handleGrant = async () => {
    setSaving(true);
    setMsg('');
    try {
      const { data } = await axios.patch(`${API_URL}/api/super-admin/clubes/${club.id}/plan`, { plan });
      setMsg(data.message || 'Acceso concedido.');
      setOpen(false);
      onUpdated();
    } catch (err) {
      setMsg(err?.response?.data?.error || 'Error al conceder acceso.');
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = async () => {
    setRevoking(true);
    setMsg('');
    try {
      const { data } = await axios.patch(`${API_URL}/api/super-admin/clubes/${club.id}/restringir`);
      setMsg(data.message || 'Acceso restringido.');
      setConfirmRevoke(false);
      setOpen(false);
      onUpdated();
    } catch (err) {
      setMsg(err?.response?.data?.error || 'Error al restringir acceso.');
    } finally {
      setRevoking(false);
    }
  };

  const sub = club.suscripcion;

  return (
    <>
      <tr className="border-b border-white/5 hover:bg-white/5 transition-colors">
        <td className="px-4 py-3 text-white font-medium">{club.nombre}</td>
        <td className="px-4 py-3 text-slate-400 font-mono text-xs">{club.slug}</td>
        <td className="px-4 py-3">
          {club.plan
            ? <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${planBadgeClass(club.plan)}`}>{club.plan}</span>
            : <span className="text-slate-600 text-xs">—</span>}
        </td>
        <td className="px-4 py-3">
          {club.is_active
            ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-300">Activo</span>
            : <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/15 text-amber-300">Inactivo</span>}
        </td>
        <td className="px-4 py-3 text-xs text-slate-400">
          {sub ? (
            <span className={`px-2 py-0.5 rounded-full font-medium ${sub.status === 'authorized' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-yellow-500/15 text-yellow-300'}`}>
              {sub.status}
            </span>
          ) : <span className="text-slate-600">Sin suscripción</span>}
        </td>
        <td className="px-4 py-3 text-xs text-slate-500">
          {sub?.next_payment_date ?? '—'}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => { setOpen((v) => !v); setConfirmRevoke(false); setMsg(''); }}
              className="text-xs bg-violet-500/15 hover:bg-violet-500/25 border border-violet-500/30 text-violet-300 py-1 px-3 rounded-lg transition-colors font-semibold"
            >
              {open ? 'Cancelar' : 'Dar acceso gratuito'}
            </button>
            {club.is_active && (
              <button
                type="button"
                onClick={() => { setConfirmRevoke((v) => !v); setOpen(false); setMsg(''); }}
                className="text-xs bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 py-1 px-3 rounded-lg transition-colors font-semibold"
              >
                {confirmRevoke ? 'Cancelar' : 'Restringir acceso'}
              </button>
            )}
          </div>
        </td>
      </tr>

      {(open || confirmRevoke || msg) && (
        <tr className="bg-slate-900/60">
          <td colSpan={7} className="px-6 py-4">
            {open && (
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-xs uppercase tracking-wider text-slate-400 mb-1.5 font-bold">Plan a asignar</label>
                  <select
                    value={plan}
                    onChange={(e) => setPlan(e.target.value)}
                    className="rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                  >
                    {PLAN_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={handleGrant}
                  disabled={saving}
                  className="rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-60 px-4 py-2 text-sm font-bold text-white transition-colors"
                >
                  {saving ? 'Guardando...' : `Confirmar — plan ${plan}`}
                </button>
              </div>
            )}

            {confirmRevoke && (
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm text-red-300">
                  ¿Restringir acceso al club <span className="font-bold">{club.nombre}</span>? Quedará inactivo y su suscripción se marcará como cancelada.
                </p>
                <button
                  type="button"
                  onClick={handleRevoke}
                  disabled={revoking}
                  className="rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-60 px-4 py-2 text-sm font-bold text-white transition-colors"
                >
                  {revoking ? 'Restringiendo...' : 'Sí, restringir acceso'}
                </button>
              </div>
            )}

            {msg && (
              <p className={`text-xs rounded px-3 py-2 border mt-2 ${msg.toLowerCase().startsWith('error') ? 'text-red-300 bg-red-500/10 border-red-500/30' : 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30'}`}>
                {msg}
              </p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

export default function SuperAdminPage() {
  const demoHome = buildClubPath(DEFAULT_CLUB_SLUG, '/inicio');

  const [activeTab, setActiveTab]       = useState('alta');
  const [form, setForm] = useState({
    nombreClub: '',
    slug: '',
    adminEmail: '',
    temporaryPassword: '',
  });
  const [slugEdited, setSlugEdited] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [clubs, setClubs] = useState([]);

  const fetchClubs = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_URL}/api/super-admin/clubes`);
      setClubs(data || []);
    } catch (_) { /* silent */ }
  }, []);

  useEffect(() => { fetchClubs(); }, [fetchClubs]);

  const createdPaths = useMemo(() => {
    if (!result?.access) return null;

    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const loginUrl = `${origin}${result.access.login_url || ''}`;
    const appUrl = `${origin}${result.access.app_url || ''}`;

    return { loginUrl, appUrl };
  }, [result]);

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleNameChange = (event) => {
    const value = event.target.value;
    setForm((prev) => ({
      ...prev,
      nombreClub: value,
      slug: slugEdited ? prev.slug : slugify(value),
    }));
  };

  const handleSlugChange = (event) => {
    setSlugEdited(true);
    updateField('slug', slugify(event.target.value));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setResult(null);

    const payload = {
      nombreClub: form.nombreClub.trim(),
      slug: slugify(form.slug),
      adminEmail: form.adminEmail.trim().toLowerCase(),
      temporaryPassword: String(form.temporaryPassword || '').trim(),
    };

    if (payload.nombreClub.length < 3) {
      setError('El nombre del club debe tener al menos 3 caracteres.');
      return;
    }

    if (!payload.slug) {
      setError('El slug es obligatorio.');
      return;
    }

    if (!isValidEmail(payload.adminEmail)) {
      setError('Ingresa un email valido para el admin del club.');
      return;
    }

    if (payload.temporaryPassword && payload.temporaryPassword.length < 8) {
      setError('La password temporal debe tener al menos 8 caracteres.');
      return;
    }

    setLoading(true);

    try {
      const { data } = await axios.post(`${API_URL}/api/super-admin/clubes`, payload);
      setResult(data);
      setForm({ nombreClub: '', slug: '', adminEmail: '', temporaryPassword: '' });
      setSlugEdited(false);
      fetchClubs();
    } catch (requestError) {
      const apiError = requestError?.response?.data?.error;
      const apiDetail = requestError?.response?.data?.detail;
      const fullError = [apiError, apiDetail].filter(Boolean).join(' Detalle: ');
      setError(fullError || 'No se pudo crear el club. Revisa los datos e intenta nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-5xl mx-auto px-4 py-10">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-300 font-bold">Super Admin</p>
            <h1 className="text-3xl font-black mt-2">Panel de control</h1>
          </div>
          <Link
            to={demoHome}
            className="inline-flex items-center rounded-lg border border-white/15 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-white/5 transition-colors"
          >
            Ir al demo
          </Link>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 mb-8 rounded-xl bg-white/5 border border-white/10 p-1 w-fit">
          {[
            { key: 'alta',   label: 'Alta de Club' },
            { key: 'clubes', label: 'Clubes y Suscripciones' },
          ].map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveTab(t.key)}
              className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
                activeTab === t.key
                  ? 'bg-emerald-500 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── TAB: Alta de Club ── */}
        {activeTab === 'alta' && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 md:p-8 shadow-2xl shadow-black/20">
            <h2 className="text-sm font-black uppercase tracking-wider text-slate-300 mb-1">Alta de Club</h2>
            <p className="text-xs text-slate-400 mb-6">Crea un club, define su plan y genera automáticamente la cuenta de su administrador.</p>

            {error && (
              <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {error}
              </div>
            )}

            {result?.message && (
              <div className="mb-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                {result.message}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">Nombre del Club</label>
                <input
                  type="text"
                  value={form.nombreClub}
                  onChange={handleNameChange}
                  placeholder="Club de Tenis Los Ceibos"
                  required
                  className="w-full rounded-xl border border-white/10 bg-slate-900/70 px-4 py-3 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">Slug / URL</label>
                  <input
                    type="text"
                    value={form.slug}
                    onChange={handleSlugChange}
                    placeholder="ceibos-tenis"
                    required
                    className="w-full rounded-xl border border-white/10 bg-slate-900/70 px-4 py-3 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">Email del Admin del Club</label>
                  <input
                    type="email"
                    value={form.adminEmail}
                    onChange={(event) => updateField('adminEmail', event.target.value)}
                    placeholder="admin@ceibostenis.com"
                    required
                    className="w-full rounded-xl border border-white/10 bg-slate-900/70 px-4 py-3 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">Password Temporal (opcional)</label>
                <input
                  type="text"
                  value={form.temporaryPassword}
                  onChange={(event) => updateField('temporaryPassword', event.target.value)}
                  placeholder="Si lo dejas vacio, se genera una automaticamente"
                  className="w-full rounded-xl border border-white/10 bg-slate-900/70 px-4 py-3 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
                <p className="mt-1 text-xs text-slate-400">El admin podra cambiarla despues desde su cuenta.</p>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 py-3 text-sm font-black text-white transition-all hover:from-emerald-400 hover:to-teal-400 disabled:opacity-60"
              >
                {loading ? 'Creando club...' : 'Dar de alta club'}
              </button>
            </form>

            {result?.club && (
              <div className="mt-6 rounded-xl border border-white/10 bg-slate-900/50 p-4 space-y-2">
                <h2 className="text-sm font-black uppercase tracking-wider text-emerald-300">Club creado</h2>
                <p className="text-sm text-slate-200">Club: <span className="font-bold">{result.club.nombre}</span></p>
                <p className="text-sm text-slate-300">Slug: {result.club.slug}</p>
                <p className="text-sm text-slate-300">Admin: {result.admin?.email}</p>
                {result.admin?.temporary_password && (
                  <p className="text-sm text-slate-200">Password temporal: <span className="font-mono font-bold text-amber-300">{result.admin.temporary_password}</span></p>
                )}

                {result.access?.activation_link && (
                  <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-amber-300 mb-2">Link de activación — enviáselo al cliente</p>
                    <p className="text-sm text-amber-100 break-all font-mono mb-2">{result.access.activation_link}</p>
                    <button
                      type="button"
                      onClick={() => navigator.clipboard.writeText(result.access.activation_link)}
                      className="text-xs bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 py-1 px-3 rounded-lg transition-colors"
                    >
                      Copiar link
                    </button>
                  </div>
                )}

                {createdPaths && (
                  <>
                    <p className="text-xs uppercase tracking-wider text-slate-400 mt-3">Accesos</p>
                    <a className="block text-sm text-emerald-300 hover:text-emerald-200" href={createdPaths.loginUrl}>{createdPaths.loginUrl}</a>
                    <a className="block text-sm text-emerald-300 hover:text-emerald-200" href={createdPaths.appUrl}>{createdPaths.appUrl}</a>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── TAB: Clubes y Suscripciones ── */}
        {activeTab === 'clubes' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-slate-400">{clubs.length} club{clubs.length !== 1 ? 's' : ''} registrado{clubs.length !== 1 ? 's' : ''}</p>
              <button
                type="button"
                onClick={fetchClubs}
                className="text-xs text-slate-400 hover:text-white border border-white/10 rounded-lg px-3 py-1.5 transition-colors"
              >
                Actualizar
              </button>
            </div>

            {clubs.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-10 text-center text-slate-500">
                No hay clubes registrados.
              </div>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-white/5 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-slate-400">
                      <th className="px-4 py-3 text-left">Nombre</th>
                      <th className="px-4 py-3 text-left">Slug</th>
                      <th className="px-4 py-3 text-left">Plan</th>
                      <th className="px-4 py-3 text-left">Estado</th>
                      <th className="px-4 py-3 text-left">Suscripción</th>
                      <th className="px-4 py-3 text-left">Próximo pago</th>
                      <th className="px-4 py-3 text-left">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clubs.map((c) => (
                      <ClubRow key={c.id} club={c} onUpdated={fetchClubs} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
