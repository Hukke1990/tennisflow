import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { IconAlertTriangle, IconArrowRight } from '../components/icons/UiIcons';
import { useClubPath } from '../context/ClubContext';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const navigate = useNavigate();
  const toClubPath = useClubPath();
  const { user, loading: authLoading } = useAuth();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (authLoading || !user) return;
    navigate(toClubPath('/torneos'), { replace: true });
  }, [authLoading, navigate, toClubPath, user]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: form.email,
      password: form.password,
    });

    setLoading(false);

    if (authError) {
      if (authError.message.includes('Invalid login credentials')) {
        setError('Email o contraseña incorrectos. Verificá tus datos.');
      } else if (authError.message.includes('Email not confirmed')) {
        setError('Debés confirmar tu email antes de ingresar. Revisá tu bandeja de entrada.');
      } else {
        setError(authError.message);
      }
      return;
    }

    navigate(toClubPath('/torneos'), { replace: true });
  };

  return (
    <div>
      <h2 className="text-2xl font-black text-white mb-1">Iniciar Sesión</h2>
      <p className="text-gray-400 text-sm mb-8">Ingresá para acceder a tu cuenta TennisFlow</p>
      
      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-xl inline-flex items-start gap-2">
          <IconAlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">Email</label>
          <input
            type="email"
            value={form.email}
            onChange={e => setForm({...form, email: e.target.value})}
            placeholder="usuario@email.com"
            className="w-full bg-white/5 border border-white/10 text-white placeholder-gray-600 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all"
            required
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">Contraseña</label>
          <input
            type="password"
            value={form.password}
            onChange={e => setForm({...form, password: e.target.value})}
            placeholder="••••••••"
            className="w-full bg-white/5 border border-white/10 text-white placeholder-gray-600 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all"
            required
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold rounded-xl hover:from-emerald-400 hover:to-teal-400 transition-all shadow-lg shadow-emerald-900/30 mt-2 disabled:opacity-60"
        >
          {loading ? 'Ingresando...' : (
            <span className="inline-flex items-center gap-1.5">
              Entrar
              <IconArrowRight className="h-4 w-4" />
            </span>
          )}
        </button>
      </form>
      
      <p className="text-center text-gray-500 text-sm mt-6">
        ¿No tenés cuenta?{' '}
        <Link to={toClubPath('/registro')} className="text-emerald-400 hover:text-emerald-300 font-semibold">
          Registrate
        </Link>
      </p>
    </div>
  );
}
