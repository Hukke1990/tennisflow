import { useState } from 'react';
import axios from 'axios';

export default function BajaModal({ inscripcionId, torneoTitulo, onClose, onSuccess }) {
  const [motivo, setMotivo] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleConfirmar = async () => {
    if (!motivo.trim()) {
      setError('El motivo es obligatorio para solicitar la baja.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data } = await axios.patch(`/api/torneos/inscripciones/${inscripcionId}/baja`, {
        motivo_baja: motivo.trim(),
      });
      onSuccess(data);
    } catch (err) {
      const mensaje = err?.response?.data?.error || 'Ocurrió un error al solicitar la baja. Intentá nuevamente.';
      setError(mensaje);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="baja-modal-title"
    >
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-white/15 bg-[#0d2740]/90 backdrop-blur-xl shadow-2xl p-6 sm:p-7 space-y-5">
        {/* Header */}
        <div className="space-y-1">
          <h2
            id="baja-modal-title"
            className="text-xl font-black text-white leading-tight"
          >
            Solicitar Baja del Torneo
          </h2>
          {torneoTitulo && (
            <p className="text-sm text-slate-400 font-medium">{torneoTitulo}</p>
          )}
        </div>

        <p className="text-sm text-slate-300">
          Tu solicitud quedará pendiente hasta que el administrador la revise. Una vez aprobada, tu inscripción será cancelada.
        </p>

        {/* Motivo */}
        <div className="space-y-1.5">
          <label
            htmlFor="baja-motivo"
            className="block text-xs font-bold uppercase tracking-wide text-slate-400"
          >
            Motivo de baja <span className="text-rose-400">*</span>
          </label>
          <textarea
            id="baja-motivo"
            value={motivo}
            onChange={(e) => {
              setMotivo(e.target.value);
              if (error) setError(null);
            }}
            placeholder="Explicá brevemente el motivo de tu solicitud de baja..."
            rows={4}
            maxLength={500}
            className="w-full rounded-xl border border-white/15 bg-[#061529]/80 text-slate-100 placeholder-slate-500 px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-rose-400/50 focus:border-rose-400/60 transition-colors"
          />
          <p className="text-[11px] text-slate-500 text-right">{motivo.length}/500</p>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-xl border border-rose-400/30 bg-rose-900/20 px-4 py-3 text-sm text-rose-300 font-medium">
            {error}
          </div>
        )}

        {/* Acciones */}
        <div className="flex flex-col sm:flex-row gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-2.5 px-4 rounded-xl border border-white/15 text-slate-200 font-bold text-sm hover:bg-white/5 transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirmar}
            disabled={loading || !motivo.trim()}
            className="flex-1 py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            {loading ? 'Enviando...' : 'Confirmar Baja'}
          </button>
        </div>
      </div>
    </div>
  );
}
