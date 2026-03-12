import { useMemo, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { DEFAULT_CLUB_SLUG, buildClubPath } from '../context/ClubContext';

const API_URL = 'http://localhost:3000';

const PLAN_OPTIONS = [
  { value: 'basico', label: 'Basico' },
  { value: 'pro', label: 'Pro' },
  { value: 'premium', label: 'Premium' },
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

export default function SuperAdminPage() {
  const demoHome = buildClubPath(DEFAULT_CLUB_SLUG, '/inicio');

  const [form, setForm] = useState({
    nombreClub: '',
    slug: '',
    plan: 'basico',
    adminEmail: '',
    temporaryPassword: '',
  });
  const [slugEdited, setSlugEdited] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

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
      plan: String(form.plan || '').trim().toLowerCase(),
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
      setForm({ nombreClub: '', slug: '', plan: 'basico', adminEmail: '', temporaryPassword: '' });
      setSlugEdited(false);
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
      <div className="max-w-4xl mx-auto px-4 py-10">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-300 font-bold">Super Admin</p>
            <h1 className="text-3xl font-black mt-2">Alta de Club</h1>
            <p className="text-sm text-slate-300 mt-2">Crea un club, define su plan y genera automaticamente la cuenta de su administrador.</p>
          </div>
          <Link
            to={demoHome}
            className="inline-flex items-center rounded-lg border border-white/15 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-white/5 transition-colors"
          >
            Ir al demo
          </Link>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 md:p-8 shadow-2xl shadow-black/20">
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
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">Plan</label>
                <select
                  value={form.plan}
                  onChange={(event) => updateField('plan', event.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-slate-900/70 px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                >
                  {PLAN_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
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
            <div className="mt-6 rounded-xl border border-white/10 bg-slate-900/50 p-4">
              <h2 className="text-sm font-black uppercase tracking-wider text-emerald-300">Resultado</h2>
              <p className="mt-2 text-sm text-slate-200">Club: <span className="font-bold">{result.club.nombre}</span></p>
              <p className="mt-1 text-sm text-slate-300">Slug: {result.club.slug}</p>
              <p className="mt-1 text-sm text-slate-300">Plan: {result.club.plan}</p>
              <p className="mt-1 text-sm text-slate-300">Admin: {result.admin?.email}</p>
              {result.admin?.temporary_password && (
                <p className="mt-1 text-sm text-slate-200">Password temporal: <span className="font-mono font-bold text-amber-300">{result.admin.temporary_password}</span></p>
              )}
              {createdPaths && (
                <>
                  <p className="mt-3 text-xs uppercase tracking-wider text-slate-400">Accesos</p>
                  <a className="mt-1 block text-sm text-emerald-300 hover:text-emerald-200" href={createdPaths.loginUrl}>{createdPaths.loginUrl}</a>
                  <a className="mt-1 block text-sm text-emerald-300 hover:text-emerald-200" href={createdPaths.appUrl}>{createdPaths.appUrl}</a>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
