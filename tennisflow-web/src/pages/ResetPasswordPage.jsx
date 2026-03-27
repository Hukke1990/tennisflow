import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconAlertTriangle } from '../components/icons/UiIcons';
import { useClubPath } from '../context/ClubContext';
import { supabase } from '../lib/supabase';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const toClubPath = useClubPath();
  const [form, setForm] = useState({ password: '', confirm: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [done, setDone] = useState(false);

  // Supabase dispara PASSWORD_RECOVERY cuando el usuario llega desde el email de reset.
  // Esperamos ese evento antes de mostrar el formulario.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setReady(true);
      }
    });

    // Si la sesión ya está activa con recovery (recarga de página), también habilitamos.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (form.password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (form.password !== form.confirm) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password: form.password });
    setLoading(false);

    if (updateError) {
      setError(updateError.message || 'No se pudo actualizar la contraseña. Intentá de nuevo.');
      return;
    }

    setDone(true);
    setTimeout(() => navigate(toClubPath('/login'), { replace: true }), 2500);
  };

  if (done) {
    return (
      <div className="text-center">
        <div
          className="mx-auto mb-5 h-14 w-14 rounded-2xl flex items-center justify-center"
          style={{ background: 'rgba(166,206,57,0.12)', border: '1px solid rgba(166,206,57,0.25)' }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="#A6CE39" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-xl font-black text-white mb-2">¡Contraseña actualizada!</h2>
        <p className="text-slate-400 text-sm">Redirigiendo al inicio de sesión...</p>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="text-center py-4">
        <div className="h-6 w-6 rounded-full border-2 border-white/10 border-t-[#A6CE39] animate-spin mx-auto mb-4" />
        <p className="text-slate-400 text-sm">Verificando enlace de recuperación...</p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <h2 className="text-xl font-black text-white mb-1">Nueva contraseña</h2>
      <p className="text-slate-400 text-sm mb-6">Elegí una nueva contraseña para tu cuenta.</p>

      {error && (
        <div className="mb-5 p-3.5 rounded-2xl bg-red-500/10 border border-red-500/25 flex items-start gap-2.5">
          <IconAlertTriangle className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
          <span className="text-red-300 text-sm leading-snug">{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500 mb-1.5">Nueva contraseña</label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={form.password}
              onChange={e => setForm({ ...form, password: e.target.value })}
              placeholder="••••••••"
              className="w-full bg-white/[0.05] border border-white/10 text-white placeholder-slate-600 rounded-xl px-4 py-3 pr-11 text-sm focus:outline-none focus:border-[#A6CE39]/50 focus:ring-2 focus:ring-[#A6CE39]/15 transition-all"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors p-1"
              tabIndex={-1}
              aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            >
              {showPassword ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 4.411m0 0L21 21" /></svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
              )}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500 mb-1.5">Confirmar contraseña</label>
          <input
            type={showPassword ? 'text' : 'password'}
            value={form.confirm}
            onChange={e => setForm({ ...form, confirm: e.target.value })}
            placeholder="••••••••"
            className="w-full bg-white/[0.05] border border-white/10 text-white placeholder-slate-600 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#A6CE39]/50 focus:ring-2 focus:ring-[#A6CE39]/15 transition-all"
            required
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 rounded-xl font-bold text-sm text-[#040e1c] mt-2 disabled:opacity-50 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
          style={{ background: loading ? '#6b8c2a' : '#A6CE39', boxShadow: '0 4px 24px rgba(166,206,57,0.25)' }}
        >
          {loading ? (
            <><div className="h-4 w-4 rounded-full border-2 border-[#040e1c]/40 border-t-[#040e1c] animate-spin" />Guardando...</>
          ) : (
            'Guardar contraseña'
          )}
        </button>
      </form>
    </div>
  );
}
