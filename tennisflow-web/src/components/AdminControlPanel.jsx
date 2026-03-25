/* eslint-disable react/prop-types */
import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Edit, Trash2, RefreshCcw, UserMinus, Search, X, Check, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

const API_URL = '';

// ── helpers ───────────────────────────────────────────────────────────────────

const fmtDate = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const ESTADO_LABELS = {
  borrador: 'Borrador',
  publicado: 'Publicado',
  abierto: 'Abierto',
  en_progreso: 'En progreso',
  finalizado: 'Finalizado',
  cancelado: 'Cancelado',
};

const CATEGORIA_LABELS = { 1: '1ª', 2: '2ª', 3: '3ª', 4: '4ª', 5: '5ª' };
const SEXO_LABELS = { Masculino: 'Masculino', Femenino: 'Femenino', Mixto: 'Mixto' };
const ROL_OPTIONS = ['jugador', 'admin', 'super_admin'];

// ── sub-components ────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="flex justify-center py-10">
      <div className="h-8 w-8 rounded-full border-4 border-[#a6ce39] border-t-transparent animate-spin" />
    </div>
  );
}

function Toast({ msg, type, onClose }) {
  if (!msg) return null;
  const colors = type === 'error'
    ? 'bg-red-500/20 border-red-400/40 text-red-300'
    : 'bg-emerald-500/20 border-emerald-400/40 text-emerald-300';
  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl border backdrop-blur-md shadow-xl ${colors}`}>
      {type === 'error' ? <AlertTriangle className="h-4 w-4 shrink-0" /> : <Check className="h-4 w-4 shrink-0" />}
      <span className="text-sm font-semibold">{msg}</span>
      <button type="button" onClick={onClose}><X className="h-4 w-4 opacity-60 hover:opacity-100" /></button>
    </div>
  );
}

function ConfirmModal({ title, message, onConfirm, onCancel, dangerous = false }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0d1d35] shadow-2xl p-6">
        <div className="flex items-start gap-3 mb-4">
          <AlertTriangle className={`h-6 w-6 shrink-0 mt-0.5 ${dangerous ? 'text-red-400' : 'text-amber-400'}`} />
          <div>
            <p className="font-black text-white text-lg">{title}</p>
            <p className="text-white/60 text-sm mt-1">{message}</p>
          </div>
        </div>
        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg border border-white/15 text-white/60 hover:text-white hover:border-white/30 text-sm font-semibold transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2 rounded-lg text-sm font-black transition-colors ${dangerous ? 'bg-red-500/20 border border-red-400/40 text-red-300 hover:bg-red-500/35' : 'bg-[#a6ce39]/20 border border-[#a6ce39]/40 text-[#a6ce39] hover:bg-[#a6ce39]/30'}`}
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Torneos Tab ───────────────────────────────────────────────────────────────

function TorneosTab() {
  const [torneos, setTorneos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [search, setSearch] = useState('');
  const [editForm, setEditForm] = useState({});

  const showToast = (msg, type = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchTorneos = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API_URL}/api/super-admin/torneos`);
      setTorneos(Array.isArray(data) ? data : []);
    } catch {
      showToast('Error al cargar torneos.', 'error');
    } finally {
      setLoading(false);
    }
  }, [])

  const openEdit = (torneo) => {
    setEditTarget(torneo);
    setEditForm({
      titulo: torneo.titulo || '',
      rama: torneo.rama || 'Masculino',
      modalidad: torneo.modalidad || 'Singles',
      categoria_id: String(torneo.categoria_id || '3'),
      fecha_inicio: torneo.fecha_inicio ? torneo.fecha_inicio.slice(0, 10) : '',
      fecha_fin: torneo.fecha_fin ? torneo.fecha_fin.slice(0, 10) : '',
      estado: torneo.estado || 'abierto',
      costo: torneo.costo ?? 0,
      puntos_ronda_32: torneo.puntos_ronda_32 ?? 5,
      puntos_ronda_16: torneo.puntos_ronda_16 ?? 10,
      puntos_ronda_8: torneo.puntos_ronda_8 ?? 25,
      puntos_ronda_4: torneo.puntos_ronda_4 ?? 50,
      puntos_ronda_2: torneo.puntos_ronda_2 ?? 100,
      puntos_campeon: torneo.puntos_campeon ?? 100,
    });
  };

  const saveEdit = async () => {
    if (!editTarget) return;
    setSaving(true);
    const payload = {
      ...editForm,
      categoria_id: Number(editForm.categoria_id) || null,
      costo: parseFloat(editForm.costo) || 0,
      puntos_ronda_32: Number(editForm.puntos_ronda_32) || 0,
      puntos_ronda_16: Number(editForm.puntos_ronda_16) || 0,
      puntos_ronda_8: Number(editForm.puntos_ronda_8) || 0,
      puntos_ronda_4: Number(editForm.puntos_ronda_4) || 0,
      puntos_ronda_2: Number(editForm.puntos_ronda_2) || 0,
      puntos_campeon: Number(editForm.puntos_campeon) || 0,
    };
    try {
      await axios.patch(`${API_URL}/api/super-admin/torneos/${editTarget.id}`, payload);
      showToast('Torneo actualizado.');
      setEditTarget(null);
      fetchTorneos();
    } catch {
      showToast('Error al guardar cambios.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await axios.delete(`${API_URL}/api/super-admin/torneos/${deleteTarget.id}`);
      showToast('Torneo desactivado (soft delete).');
      setDeleteTarget(null);
      fetchTorneos();
    } catch {
      showToast('Error al desactivar torneo.', 'error');
    }
  };

  useEffect(() => { fetchTorneos(); }, [fetchTorneos]);

  const filtered = search.trim()
    ? torneos.filter((t) => t.titulo?.toLowerCase().includes(search.toLowerCase()))
    : torneos;

  const inputCls = 'bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#a6ce39]/60 w-full';

  return (
    <>
      <Toast msg={toast?.msg} type={toast?.type} onClose={() => setToast(null)} />

      {deleteTarget && (
        <ConfirmModal
          title="¿Cancelar torneo?"
          message={`"${deleteTarget.titulo}" cambiará su estado a 'cancelado'. Los datos históricos se mantienen.`}
          dangerous
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#0d1d35] shadow-2xl flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
              <h3 className="font-black text-white text-xl">Editar Torneo</h3>
              <button type="button" onClick={() => setEditTarget(null)} className="text-white/40 hover:text-white/80 transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
            {/* Body – scrollable */}
            <div className="overflow-y-auto px-6 py-4 grid grid-cols-1 gap-4">
              <label className="flex flex-col gap-1.5 text-xs text-white/50 font-semibold uppercase tracking-wide">
                Título
                <input className={inputCls} value={editForm.titulo} onChange={(e) => setEditForm((p) => ({ ...p, titulo: e.target.value }))} />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5 text-xs text-white/50 font-semibold uppercase tracking-wide">
                  Rama
                  <select className={inputCls} value={editForm.rama} onChange={(e) => setEditForm((p) => ({ ...p, rama: e.target.value }))}>
                    {['Masculino', 'Femenino', 'Mixto'].map((r) => <option key={r} value={r} className="bg-[#0d1d35] text-white">{r}</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-white/50 font-semibold uppercase tracking-wide">
                  Modalidad
                  <select className={inputCls} value={editForm.modalidad} onChange={(e) => setEditForm((p) => ({ ...p, modalidad: e.target.value }))}>
                    {['Singles', 'Dobles'].map((m) => <option key={m} value={m} className="bg-[#0d1d35] text-white">{m}</option>)}
                  </select>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5 text-xs text-white/50 font-semibold uppercase tracking-wide">
                  Categoría
                  <select className={inputCls} value={editForm.categoria_id} onChange={(e) => setEditForm((p) => ({ ...p, categoria_id: e.target.value }))}>
                    {[1,2,3,4,5].map((c) => <option key={c} value={String(c)} className="bg-[#0d1d35] text-white">{CATEGORIA_LABELS[c]}</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-white/50 font-semibold uppercase tracking-wide">
                  Estado
                  <select className={inputCls} value={editForm.estado} onChange={(e) => setEditForm((p) => ({ ...p, estado: e.target.value }))}>
                    {Object.entries(ESTADO_LABELS).map(([v, l]) => <option key={v} value={v} className="bg-[#0d1d35] text-white">{l}</option>)}
                  </select>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5 text-xs text-white/50 font-semibold uppercase tracking-wide">
                  Fecha inicio
                  <input type="date" className={inputCls} value={editForm.fecha_inicio} onChange={(e) => setEditForm((p) => ({ ...p, fecha_inicio: e.target.value }))} />
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-white/50 font-semibold uppercase tracking-wide">
                  Fecha fin
                  <input type="date" className={inputCls} value={editForm.fecha_fin} onChange={(e) => setEditForm((p) => ({ ...p, fecha_fin: e.target.value }))} />
                </label>
              </div>
              <label className="flex flex-col gap-1.5 text-xs text-white/50 font-semibold uppercase tracking-wide">
                Costo inscripción ($)
                <input type="number" min="0" step="0.01" className={inputCls} value={editForm.costo} onChange={(e) => setEditForm((p) => ({ ...p, costo: e.target.value }))} />
              </label>
              <div>
                <p className="text-xs text-white/50 font-semibold uppercase tracking-wide mb-2">Puntos por ronda</p>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { key: 'puntos_ronda_32', label: 'Primera (32)' },
                    { key: 'puntos_ronda_16', label: 'Octavos (16)' },
                    { key: 'puntos_ronda_8',  label: 'Cuartos (8)' },
                    { key: 'puntos_ronda_4',  label: 'Semifinal (4)' },
                    { key: 'puntos_ronda_2',  label: 'Finalista (2)' },
                    { key: 'puntos_campeon',  label: 'Campeón' },
                  ].map(({ key, label }) => (
                    <label key={key} className="flex flex-col gap-1 text-xs text-white/40 font-semibold uppercase tracking-wide">
                      {label}
                      <input type="number" min="0" className={inputCls} value={editForm[key] ?? ''} onChange={(e) => setEditForm((p) => ({ ...p, [key]: e.target.value }))} />
                    </label>
                  ))}
                </div>
              </div>
            </div>
            {/* Footer */}
            <div className="flex gap-3 justify-end px-6 py-4 border-t border-white/10 shrink-0">
              <button type="button" onClick={() => setEditTarget(null)} className="px-4 py-2 rounded-lg border border-white/15 text-white/60 hover:text-white text-sm font-semibold transition-colors">Cancelar</button>
              <button type="button" onClick={saveEdit} disabled={saving} className="px-5 py-2 rounded-lg bg-[#a6ce39]/20 border border-[#a6ce39]/40 text-[#a6ce39] font-black text-sm hover:bg-[#a6ce39]/30 transition-colors disabled:opacity-50">
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 mb-4">
        <input
          className="bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#a6ce39]/60 w-64"
          placeholder="Buscar por nombre…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="button" onClick={fetchTorneos} className="p-2 rounded-lg bg-white/5 border border-white/15 text-white/50 hover:text-white hover:border-white/30 transition-colors" title="Recargar">
          <RefreshCcw className="h-4 w-4" />
        </button>
        <span className="text-xs text-white/30 ml-auto">{filtered.length} torneos</span>
      </div>

      {loading ? <Spinner /> : (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.03]">
                {['Nombre', 'Categoría', 'Sexo', 'Inicio', 'Fin', 'Estado', 'Acciones'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-black uppercase tracking-wider text-white/40">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-white/30 text-sm">Sin torneos</td></tr>
              )}
              {filtered.map((t) => (
                <tr key={t.id} className="transition-colors hover:bg-white/[0.03]">
                  <td className="px-4 py-3 text-white font-semibold max-w-[180px] truncate">{t.titulo}</td>
                  <td className="px-4 py-3 text-white/60">{CATEGORIA_LABELS[t.categoria_id] || t.categoria_id || '—'}</td>
                  <td className="px-4 py-3 text-white/60">{SEXO_LABELS[t.rama] || t.rama || '—'}</td>
                  <td className="px-4 py-3 text-white/60 whitespace-nowrap">{fmtDate(t.fecha_inicio)}</td>
                  <td className="px-4 py-3 text-white/60 whitespace-nowrap">{fmtDate(t.fecha_fin)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-black border ${
                      t.estado === 'finalizado' ? 'bg-emerald-500/15 border-emerald-400/30 text-emerald-300'
                        : t.estado === 'en_curso' ? 'bg-[#a6ce39]/15 border-[#a6ce39]/30 text-[#a6ce39]'
                          : 'bg-white/5 border-white/15 text-white/50'
                    }`}>{ESTADO_LABELS[t.estado] || t.estado || '—'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => openEdit(t)} className="p-1.5 rounded-lg bg-sky-500/10 border border-sky-400/20 text-sky-400 hover:bg-sky-500/20 transition-colors" title="Editar">
                        <Edit className="h-3.5 w-3.5" />
                      </button>
                      {t.estado !== 'cancelado' && (
                        <button type="button" onClick={() => setDeleteTarget(t)} className="p-1.5 rounded-lg bg-red-500/10 border border-red-400/20 text-red-400 hover:bg-red-500/20 transition-colors" title="Cancelar">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ── Jugadores Tab ─────────────────────────────────────────────────────────────

function JugadoresTab() {
  const [jugadores, setJugadores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [clubFilter, setClubFilter] = useState('');
  const searchTimeout = useRef(null);

  const showToast = (msg, type = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchJugadores = useCallback(async (q = search, club = clubFilter) => {
    setLoading(true);
    try {
      const params = {};
      if (q) params.q = q;
      if (club) params.club_id = club;
      const { data } = await axios.get(`${API_URL}/api/super-admin/jugadores`, { params });
      setJugadores(Array.isArray(data) ? data : []);
    } catch {
      showToast('Error al cargar jugadores.', 'error');
    } finally {
      setLoading(false);
    }
  }, [search, clubFilter]);

  useEffect(() => { fetchJugadores(); }, [fetchJugadores]);

  const handleSearchChange = (e) => {
    const val = e.target.value;
    setSearch(val);
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => fetchJugadores(val, clubFilter), 400);
  };

  const openEdit = (j) => {
    setEditTarget(j);
    setEditForm({
      nombre_completo: j.nombre_completo || '',
      telefono: j.telefono || '',
      categoria_singles: j.categoria_singles ?? 3,
      categoria_dobles: j.categoria_dobles ?? 3,
    });
  };

  const saveEdit = async () => {
    if (!editTarget) return;
    setSaving(true);
    try {
      await axios.patch(`${API_URL}/api/super-admin/jugadores/${editTarget.id}`, editForm);
      showToast('Jugador actualizado.');
      setEditTarget(null);
      fetchJugadores();
    } catch {
      showToast('Error al guardar cambios.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#a6ce39]/60 w-full';

  return (
    <>
      <Toast msg={toast?.msg} type={toast?.type} onClose={() => setToast(null)} />

      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#0d1d35] shadow-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-black text-white text-xl">Editar Jugador</h3>
              <button type="button" onClick={() => setEditTarget(null)} className="text-white/40 hover:text-white/80 transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-1 gap-4">
              <label className="flex flex-col gap-1.5 text-xs text-white/50 font-semibold uppercase tracking-wide">
                Nombre completo
                <input className={inputCls} value={editForm.nombre_completo} onChange={(e) => setEditForm((p) => ({ ...p, nombre_completo: e.target.value }))} />
              </label>
              <label className="flex flex-col gap-1.5 text-xs text-white/50 font-semibold uppercase tracking-wide">
                Teléfono
                <input className={inputCls} value={editForm.telefono} onChange={(e) => setEditForm((p) => ({ ...p, telefono: e.target.value }))} />
              </label>
              <div className="grid grid-cols-2 gap-4">
                <label className="flex flex-col gap-1.5 text-xs text-white/50 font-semibold uppercase tracking-wide">
                  Categoría Singles
                  <select className={inputCls} value={editForm.categoria_singles} onChange={(e) => setEditForm((p) => ({ ...p, categoria_singles: Number(e.target.value) }))}>
                    {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n} className="bg-[#0d1d35] text-white">Categoría {n}</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-white/50 font-semibold uppercase tracking-wide">
                  Categoría Dobles
                  <select className={inputCls} value={editForm.categoria_dobles} onChange={(e) => setEditForm((p) => ({ ...p, categoria_dobles: Number(e.target.value) }))}>
                    {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n} className="bg-[#0d1d35] text-white">Categoría {n}</option>)}
                  </select>
                </label>
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-6">
              <button type="button" onClick={() => setEditTarget(null)} className="px-4 py-2 rounded-lg border border-white/15 text-white/60 hover:text-white text-sm font-semibold transition-colors">Cancelar</button>
              <button type="button" onClick={saveEdit} disabled={saving} className="px-5 py-2 rounded-lg bg-[#a6ce39]/20 border border-[#a6ce39]/40 text-[#a6ce39] font-black text-sm hover:bg-[#a6ce39]/30 transition-colors disabled:opacity-50">
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
          <input
            className="bg-white/5 border border-white/15 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#a6ce39]/60 w-64"
            placeholder="Buscar por nombre…"
            value={search}
            onChange={handleSearchChange}
          />
        </div>
        <input
          className="bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#a6ce39]/60 w-48"
          placeholder="Filtrar por club_id…"
          value={clubFilter}
          onChange={(e) => { setClubFilter(e.target.value); fetchJugadores(search, e.target.value); }}
        />
        <button type="button" onClick={() => fetchJugadores()} className="p-2 rounded-lg bg-white/5 border border-white/15 text-white/50 hover:text-white hover:border-white/30 transition-colors" title="Recargar">
          <RefreshCcw className="h-4 w-4" />
        </button>
        <span className="text-xs text-white/30 ml-auto">{jugadores.length} jugadores</span>
      </div>

      {loading ? <Spinner /> : (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.03]">
                {['Nombre', 'Teléfono', 'ELO', 'Acciones'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-black uppercase tracking-wider text-white/40">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {jugadores.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-white/30 text-sm">Sin jugadores</td></tr>
              )}
              {jugadores.map((j) => (
                <tr key={j.id} className="transition-colors hover:bg-white/[0.03]">
                  <td className="px-4 py-3 text-white font-semibold max-w-[200px] truncate">{j.nombre_completo || '—'}</td>
                  <td className="px-4 py-3 text-white/50 text-xs">{j.telefono || '—'}</td>
                  <td className="px-4 py-3 text-white/60 font-mono text-xs">{j.ranking_elo_singles ?? '—'}</td>
                  <td className="px-4 py-3">
                    <button type="button" onClick={() => openEdit(j)} className="p-1.5 rounded-lg bg-sky-500/10 border border-sky-400/20 text-sky-400 hover:bg-sky-500/20 transition-colors" title="Editar">
                      <Edit className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ── Rankings Tab ──────────────────────────────────────────────────────────────

function RankingsTab() {
  const [rankings, setRankings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [clubFilter, setClubFilter] = useState('');
  const [toast, setToast] = useState(null);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [resetConfirm2, setResetConfirm2] = useState(false);
  const [adjustTarget, setAdjustTarget] = useState(null);  // { jugador, delta }
  const [deltaInputs, setDeltaInputs] = useState({});       // { [id]: string }
  const [expanded, setExpanded] = useState({});

  const showToast = (msg, type = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchRankings = useCallback(async (club = clubFilter) => {
    setLoading(true);
    try {
      const params = club ? { club_id: club } : {};
      const { data } = await axios.get(`${API_URL}/api/super-admin/rankings`, { params });
      setRankings(Array.isArray(data) ? data : []);
    } catch {
      showToast('Error al cargar rankings.', 'error');
    } finally {
      setLoading(false);
    }
  }, [clubFilter]);

  useEffect(() => { fetchRankings(); }, [fetchRankings]);

  const handleAjustar = async (jugador) => {
    const raw = deltaInputs[jugador.id] || '0';
    const delta = Number(raw);
    if (!Number.isFinite(delta) || delta === 0) {
      showToast('Ingresá un número distinto de 0.', 'error');
      return;
    }
    setAdjustTarget({ jugador, delta });
  };

  const confirmAjuste = async () => {
    if (!adjustTarget) return;
    const { jugador, delta } = adjustTarget;
    try {
      await axios.patch(`${API_URL}/api/super-admin/rankings/${jugador.id}/puntos`, { delta, campo: 'ranking_elo_singles' });
      showToast(`ELO de ${jugador.nombre_completo} ajustado en ${delta > 0 ? '+' : ''}${delta}.`);
      setAdjustTarget(null);
      setDeltaInputs((p) => ({ ...p, [jugador.id]: '' }));
      fetchRankings();
    } catch {
      showToast('Error al ajustar puntos.', 'error');
      setAdjustTarget(null);
    }
  };

  const handleReset = () => setResetConfirm(true);
  const handleReset2 = () => { setResetConfirm(false); setResetConfirm2(true); };

  const confirmReset = async () => {
    if (!clubFilter) {
      showToast('Especificá un club_id antes de resetear.', 'error');
      setResetConfirm2(false);
      return;
    }
    try {
      await axios.post(`${API_URL}/api/super-admin/rankings/resetear`, { club_id: clubFilter, campo: 'ranking_elo_singles' });
      showToast('ELO reseteado a 0 para todos los jugadores del club.');
      setResetConfirm2(false);
      fetchRankings();
    } catch {
      showToast('Error al resetear rankings.', 'error');
      setResetConfirm2(false);
    }
  };

  return (
    <>
      <Toast msg={toast?.msg} type={toast?.type} onClose={() => setToast(null)} />

      {adjustTarget && (
        <ConfirmModal
          title="Confirmar ajuste de ELO"
          message={`¿Ajustar ELO de "${adjustTarget.jugador.nombre_completo}" en ${adjustTarget.delta > 0 ? '+' : ''}${adjustTarget.delta} puntos?`}
          onConfirm={confirmAjuste}
          onCancel={() => setAdjustTarget(null)}
        />
      )}
      {resetConfirm && (
        <ConfirmModal
          title="¿Resetear rankings?"
          message={`Todos los puntos ELO del club "${clubFilter}" se pondrán en 0. Esta acción es irreversible.`}
          dangerous
          onConfirm={handleReset2}
          onCancel={() => setResetConfirm(false)}
        />
      )}
      {resetConfirm2 && (
        <ConfirmModal
          title="⚠️ Confirmación final"
          message="¿Estás absolutamente seguro? No hay vuelta atrás. Se perderán todos los puntos ELO del club."
          dangerous
          onConfirm={confirmReset}
          onCancel={() => setResetConfirm2(false)}
        />
      )}

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <input
          className="bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#a6ce39]/60 w-64"
          placeholder="club_id (requerido para reset)…"
          value={clubFilter}
          onChange={(e) => { setClubFilter(e.target.value); fetchRankings(e.target.value); }}
        />
        <button type="button" onClick={() => fetchRankings()} className="p-2 rounded-lg bg-white/5 border border-white/15 text-white/50 hover:text-white hover:border-white/30 transition-colors" title="Recargar">
          <RefreshCcw className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={handleReset}
          disabled={!clubFilter}
          className="ml-auto flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/15 border border-red-400/30 text-red-400 font-black text-sm hover:bg-red-500/25 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <UserMinus className="h-4 w-4" />
          Resetear ELO a 0
        </button>
        <span className="text-xs text-white/30">{rankings.length} jugadores</span>
      </div>

      {loading ? <Spinner /> : (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.03]">
                {['#', 'Jugador', 'ELO actual', 'Ajustar ELO', ''].map((h, i) => (
                  <th key={i} className="px-4 py-3 text-left text-xs font-black uppercase tracking-wider text-white/40">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rankings.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-white/30 text-sm">Sin jugadores</td></tr>
              )}
              {rankings.map((j, idx) => (
                <tr key={j.id} className="transition-colors hover:bg-white/[0.03]">
                  <td className="px-4 py-3 text-white/30 font-mono text-xs w-10">{idx + 1}</td>
                  <td className="px-4 py-3 text-white font-semibold">{j.nombre_completo || '—'}</td>
                  <td className="px-4 py-3">
                    <span className="font-mono font-black text-[#a6ce39]">{j.ranking_elo_singles ?? 0}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        className="bg-white/5 border border-white/15 rounded-lg px-3 py-1.5 text-sm text-white w-24 focus:outline-none focus:border-[#a6ce39]/60 font-mono"
                        placeholder="ej. -50"
                        value={deltaInputs[j.id] || ''}
                        onChange={(e) => setDeltaInputs((p) => ({ ...p, [j.id]: e.target.value }))}
                        onKeyDown={(e) => e.key === 'Enter' && handleAjustar(j)}
                      />
                      <button
                        type="button"
                        onClick={() => handleAjustar(j)}
                        disabled={!deltaInputs[j.id] || deltaInputs[j.id] === '0'}
                        className="p-1.5 rounded-lg bg-[#a6ce39]/10 border border-[#a6ce39]/30 text-[#a6ce39] hover:bg-[#a6ce39]/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Aplicar ajuste"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setExpanded((p) => ({ ...p, [j.id]: !p[j.id] }))}
                      className="text-white/25 hover:text-white/60 transition-colors"
                      title={expanded[j.id] ? 'Colapsar' : 'Ver más'}
                    >
                      {expanded[j.id] ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

const TABS = [
  { id: 'torneos', label: 'Torneos' },
  { id: 'jugadores', label: 'Jugadores' },
  { id: 'rankings', label: 'Rankings' },
];

export default function AdminControlPanel({ onBack }) {
  const { user, rolReal, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState('torneos');
  const [sessionReady, setSessionReady] = useState(false);

  // Calienta la sesión en cache ANTES de montar los tabs para evitar que
  // el interceptor de axios quede colgado esperando getSession() en reload frío.
  useEffect(() => {
    if (!authLoading) {
      supabase.auth.getSession().then(() => setSessionReady(true));
    }
  }, [authLoading]);

  // Guard: solo super_admin
  const isSuperAdmin = String(rolReal || '').toLowerCase() === 'super_admin';

  if (!isSuperAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#040e1c]">
        <div className="text-center">
          <AlertTriangle className="h-12 w-12 text-red-400 mx-auto mb-4" />
          <p className="text-white/60 font-semibold text-lg">Acceso restringido</p>
          <p className="text-white/30 text-sm mt-1">Solo disponible para super administradores.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#040e1c] text-white">
      {/* Header */}
      <div className="border-b border-white/10 bg-white/[0.02] backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-black tracking-tight text-white">Panel de Control</h1>
              <p className="text-white/40 text-sm mt-0.5">Super Admin · SetGo Platform</p>
            </div>
            <div className="flex items-center gap-3">
              {onBack && (
                <button
                  type="button"
                  onClick={onBack}
                  className="px-3 py-2 rounded-lg border border-white/15 text-white/50 hover:text-white hover:border-white/30 text-sm font-semibold transition-colors"
                >
                  ← Alta de Club
                </button>
              )}
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-purple-400/20 bg-purple-500/10">
                <div className="h-2 w-2 rounded-full bg-purple-400 animate-pulse" />
                <span className="text-purple-300 text-xs font-black uppercase tracking-wide">{user?.email}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-white/10 bg-white/[0.015]">
        <div className="max-w-7xl mx-auto px-6">
          <nav className="flex gap-1 pt-2">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-5 py-3 text-sm font-black rounded-t-lg border-b-2 transition-all ${
                  activeTab === tab.id
                    ? 'border-[#a6ce39] text-[#a6ce39] bg-[#a6ce39]/5'
                    : 'border-transparent text-white/40 hover:text-white/70 hover:bg-white/[0.03]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {(authLoading || !sessionReady) ? (
          <div className="flex justify-center py-20">
            <div className="h-8 w-8 rounded-full border-4 border-[#a6ce39] border-t-transparent animate-spin" />
          </div>
        ) : (
          <>
            {activeTab === 'torneos' && <TorneosTab />}
            {activeTab === 'jugadores' && <JugadoresTab />}
            {activeTab === 'rankings' && <RankingsTab />}
          </>
        )}
      </div>
    </div>
  );
}
