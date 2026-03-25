import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const API_URL = '';

const ROL_OPTIONS = [
  { value: 'jugador',     label: 'Jugador' },
  { value: 'admin',       label: 'Admin' },
  { value: 'super_admin', label: 'Super Admin' },
];

const rolBadgeClass = (rol) => {
  if (rol === 'super_admin') return 'bg-purple-500/20 text-purple-300 border-purple-500/40';
  if (rol === 'admin')       return 'bg-blue-500/20   text-blue-300   border-blue-500/40';
  return                            'bg-slate-500/20  text-slate-300  border-slate-500/40';
};

const rolLabel = (rol) => {
  if (rol === 'super_admin') return 'Super Admin';
  if (rol === 'admin')       return 'Admin';
  return 'Jugador';
};

// ── Fila individual ──────────────────────────────────────────────────────────
function UserRow({ user, currentUserId, onUpdated }) {
  const [editing, setEditing]         = useState(false);
  const [selectedRol, setSelectedRol] = useState(user.rol);
  const [savingRol, setSavingRol]     = useState(false);
  const [rolError, setRolError]       = useState('');

  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const [unlinking, setUnlinking]         = useState(false);
  const [unlinkError, setUnlinkError]     = useState('');

  const [resetting, setResetting]   = useState(false);
  const [resetLink, setResetLink]   = useState('');
  const [resetError, setResetError] = useState('');
  const [copied, setCopied]         = useState(false);

  const isSelf = String(user.id) === String(currentUserId);

  const handleSaveRol = async () => {
    if (selectedRol === user.rol) { setEditing(false); return; }
    if (isSelf && selectedRol !== 'super_admin') {
      setRolError('No puedes quitarte el rol de super_admin a ti mismo.');
      return;
    }
    setSavingRol(true);
    setRolError('');
    try {
      await axios.patch(`${API_URL}/api/super-admin/usuarios/${user.id}/rol`, { rol: selectedRol });
      setEditing(false);
      onUpdated();
    } catch (err) {
      setRolError(err?.response?.data?.error || 'Error al cambiar el rol.');
    } finally {
      setSavingRol(false);
    }
  };

  const handleUnlink = async () => {
    setUnlinking(true);
    setUnlinkError('');
    try {
      await axios.delete(`${API_URL}/api/super-admin/usuarios/${user.id}/club`);
      setConfirmUnlink(false);
      onUpdated();
    } catch (err) {
      setUnlinkError(err?.response?.data?.error || 'Error al desvincular.');
    } finally {
      setUnlinking(false);
    }
  };

  const handleResetPassword = async () => {
    setResetting(true);
    setResetError('');
    setResetLink('');
    try {
      const { data } = await axios.post(`${API_URL}/api/super-admin/usuarios/${user.id}/reset-password`);
      setResetLink(data.link || '(Sin link)');
    } catch (err) {
      setResetError(err?.response?.data?.error || 'Error al generar link.');
    } finally {
      setResetting(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(resetLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const displayName = [user.nombre_completo, user.apellido].filter(Boolean).join(' ') || '—';

  return (
    <>
      <tr className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
        {/* Nombre */}
        <td className="px-4 py-3">
          <p className="font-semibold text-white text-sm">{displayName}</p>
          {isSelf && <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">(tú)</span>}
        </td>

        {/* Email */}
        <td className="px-4 py-3 text-slate-400 text-sm max-w-[200px] truncate">
          {user.email || <span className="text-slate-600 italic">sin email</span>}
        </td>

        {/* Club */}
        <td className="px-4 py-3">
          {user.club_nombre
            ? <span className="text-slate-300 text-sm">{user.club_nombre}</span>
            : <span className="text-slate-600 text-sm italic">Sin club</span>
          }
        </td>

        {/* Rol */}
        <td className="px-4 py-3">
          {editing ? (
            <div className="flex items-center gap-2">
              <select
                value={selectedRol}
                onChange={(e) => { setSelectedRol(e.target.value); setRolError(''); }}
                className="rounded-lg border border-white/10 bg-slate-800 px-2 py-1 text-xs text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              >
                {ROL_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleSaveRol}
                disabled={savingRol}
                className="rounded-lg bg-emerald-600 hover:bg-emerald-500 px-2 py-1 text-xs font-bold text-white disabled:opacity-60 transition-colors"
              >
                {savingRol ? '...' : 'OK'}
              </button>
              <button
                type="button"
                onClick={() => { setEditing(false); setSelectedRol(user.rol); setRolError(''); }}
                className="rounded-lg border border-white/10 px-2 py-1 text-xs text-slate-400 hover:text-white transition-colors"
              >
                ✕
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => { setEditing(true); setSelectedRol(user.rol); }}
              title="Cambiar rol"
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${rolBadgeClass(user.rol)} hover:opacity-80 transition-opacity`}
            >
              {rolLabel(user.rol)}
              <span className="text-[10px] opacity-60">✎</span>
            </button>
          )}
          {rolError && <p className="mt-1 text-xs text-red-400">{rolError}</p>}
        </td>

        {/* Acciones */}
        <td className="px-4 py-3">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Reset password */}
            <button
              type="button"
              onClick={handleResetPassword}
              disabled={resetting || !user.email}
              title={!user.email ? 'Sin email registrado' : 'Generar link de reset de contraseña'}
              className="rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 px-2 py-1 text-xs text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {resetting ? 'Generando…' : '🔑 Reset pw'}
            </button>

            {/* Desvincular club */}
            {user.club_id && !isSelf && (
              <button
                type="button"
                onClick={() => { setConfirmUnlink(true); setUnlinkError(''); }}
                title="Desvincular del club"
                className="rounded-lg border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 px-2 py-1 text-xs text-red-300 transition-colors"
              >
                Desvincular
              </button>
            )}
          </div>
        </td>
      </tr>

      {/* Panel inline: reset link */}
      {(resetLink || resetError) && (
        <tr className="border-b border-white/5">
          <td colSpan={5} className="px-4 pb-3">
            {resetError && (
              <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                {resetError}
              </div>
            )}
            {resetLink && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-amber-400 font-bold mb-1">
                  Link de reset — enviáselo al usuario
                </p>
                <p className="text-xs text-amber-100 font-mono break-all mb-2">{resetLink}</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="text-xs bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 py-1 px-3 rounded-lg transition-colors"
                  >
                    {copied ? '✓ Copiado' : 'Copiar link'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setResetLink(''); setResetError(''); }}
                    className="text-xs border border-white/10 text-slate-400 hover:text-white py-1 px-3 rounded-lg transition-colors"
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            )}
          </td>
        </tr>
      )}

      {/* Panel inline: confirmar desvinculación */}
      {confirmUnlink && (
        <tr className="border-b border-white/5">
          <td colSpan={5} className="px-4 pb-3">
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
              <p className="text-sm text-red-200 mb-2">
                ¿Desvincular a <strong>{displayName}</strong> de <strong>{user.club_nombre}</strong>? Se borrará su club_id y los registros en usuario_clubes.
              </p>
              {unlinkError && <p className="text-xs text-red-400 mb-2">{unlinkError}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleUnlink}
                  disabled={unlinking}
                  className="rounded-lg bg-red-600 hover:bg-red-500 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60 transition-colors"
                >
                  {unlinking ? 'Desvinculando…' : 'Sí, desvincular'}
                </button>
                <button
                  type="button"
                  onClick={() => { setConfirmUnlink(false); setUnlinkError(''); }}
                  className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-400 hover:text-white transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Componente principal ─────────────────────────────────────────────────────
export default function SuperAdminUsers({ clubs = [] }) {
  const { user: currentUser } = useAuth();
  const currentUserId = currentUser?.id;

  const [users, setUsers]       = useState([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [clubFilter, setClubFilter] = useState('');
  const [search, setSearch]     = useState('');

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = clubFilter ? { club_id: clubFilter } : {};
      const { data } = await axios.get(`${API_URL}/api/super-admin/usuarios`, { params });
      setUsers(data || []);
    } catch (err) {
      setError(err?.response?.data?.error || 'Error al cargar los usuarios.');
    } finally {
      setLoading(false);
    }
  }, [clubFilter]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const filtered = search.trim()
    ? users.filter((u) => {
        const q = search.toLowerCase();
        const name = [u.nombre_completo, u.apellido].filter(Boolean).join(' ').toLowerCase();
        return name.includes(q) || (u.email || '').toLowerCase().includes(q);
      })
    : users;

  return (
    <div>
      {/* Controles */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {/* Búsqueda */}
        <input
          type="search"
          placeholder="Buscar por nombre o email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] rounded-xl border border-white/10 bg-slate-900/70 px-4 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
        />

        {/* Filtro por club */}
        <select
          value={clubFilter}
          onChange={(e) => setClubFilter(e.target.value)}
          className="rounded-xl border border-white/10 bg-slate-900/70 px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
        >
          <option value="">Todos los clubes</option>
          {clubs.map((c) => (
            <option key={c.id} value={c.id}>{c.nombre}</option>
          ))}
        </select>

        {/* Contador + Refresh */}
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-slate-400">
            {filtered.length} usuario{filtered.length !== 1 ? 's' : ''}
          </span>
          <button
            type="button"
            onClick={fetchUsers}
            disabled={loading}
            className="text-xs text-slate-400 hover:text-white border border-white/10 rounded-lg px-3 py-1.5 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Cargando…' : 'Actualizar'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {loading && users.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-10 text-center text-slate-500 text-sm">
          Cargando usuarios…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-10 text-center text-slate-500 text-sm">
          No hay usuarios que coincidan.
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-white/5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-slate-400">
                <th className="px-4 py-3 text-left">Nombre</th>
                <th className="px-4 py-3 text-left">Email</th>
                <th className="px-4 py-3 text-left">Club</th>
                <th className="px-4 py-3 text-left">Rol</th>
                <th className="px-4 py-3 text-left">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <UserRow
                  key={u.id}
                  user={u}
                  currentUserId={currentUserId}
                  onUpdated={fetchUsers}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
