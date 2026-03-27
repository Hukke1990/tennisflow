import { useState } from 'react';
import { Link } from 'react-router-dom';
import { IconAlertTriangle } from '../components/icons/UiIcons';
import { useClubPath } from '../context/ClubContext';
import { supabase } from '../lib/supabase';

export default function ForgotPasswordPage() {
  const toClubPath = useClubPath();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const redirectTo = `${window.location.origin}${toClubPath('/nueva-contrasenia')}`;

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo,
    });

    setLoading(false);

    if (resetError) {
      const status = resetError.status ?? resetError?.code;
      if (status === 429 || String(resetError.message).toLowerCase().includes('rate limit') || String(resetError.message).toLowerCase().includes('too many')) {
        setError('Demasiados intentos. Esperá unos minutos antes de volver a intentarlo.');
      } else {
        setError('Ocurrió un error al enviar el email. Intentá de nuevo.');
      }
      return;
    }

    setSent(true);
  };

  if (sent) {
    return (
      <div className="text-center">
        <div
          className="mx-auto mb-5 h-14 w-14 rounded-2xl flex items-center justify-center"
          style={{ background: 'rgba(166,206,57,0.12)', border: '1px solid rgba(166,206,57,0.25)' }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="#A6CE39" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <h2 className="text-xl font-black text-white mb-2">Revisá tu email</h2>
        <p className="text-slate-400 text-sm leading-relaxed mb-6">
          Si existe una cuenta con ese email, recibirás un enlace para restablecer tu contraseña.
        </p>
        <Link
          to={toClubPath('/login')}
          className="text-sm font-semibold hover:text-white transition-colors"
          style={{ color: '#A6CE39' }}
        >
          ← Volver al inicio de sesión
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full">
      <h2 className="text-xl font-black text-white mb-1">Recuperar contraseña</h2>
      <p className="text-slate-400 text-sm mb-6">
        Ingresá tu email y te enviaremos un enlace para restablecer tu contraseña.
      </p>

      {error && (
        <div className="mb-5 p-3.5 rounded-2xl bg-red-500/10 border border-red-500/25 flex items-start gap-2.5">
          <IconAlertTriangle className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
          <span className="text-red-300 text-sm leading-snug">{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500 mb-1.5">Email</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="usuario@email.com"
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
            <><div className="h-4 w-4 rounded-full border-2 border-[#040e1c]/40 border-t-[#040e1c] animate-spin" />Enviando...</>
          ) : (
            'Enviar enlace'
          )}
        </button>
      </form>

      <p className="text-slate-500 text-sm mt-6">
        <Link
          to={toClubPath('/login')}
          className="font-semibold hover:text-white transition-colors"
          style={{ color: '#A6CE39' }}
        >
          ← Volver al inicio de sesión
        </Link>
      </p>
    </div>
  );
}
