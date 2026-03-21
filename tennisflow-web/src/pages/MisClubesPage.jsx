import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import setGoMark from '../assets/setgo-mark.svg';

export default function MisClubesPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [clubes, setClubes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate('/', { replace: true });
      return;
    }

    const cargarClubes = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('usuario_clubes')
        .select('club_id, clubes(id, nombre, slug, logo_url)')
        .eq('user_id', user.id);

      if (data) {
        setClubes(data.map(r => r.clubes).filter(Boolean));
      }
      setLoading(false);
    };

    cargarClubes();
  }, [user, authLoading, navigate]);

  const initials = (nombre = '') =>
    nombre.split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'CL';

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-12"
      style={{ background: 'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(166,206,57,0.10), transparent 65%), #040e1c' }}
    >
      {/* Watermark */}
      <img src={setGoMark} alt="" aria-hidden="true" className="pointer-events-none fixed bottom-0 right-0 w-[480px] opacity-[0.03]" />

      <div className="w-full max-w-md relative z-10">
        {/* Header */}
        <div className="text-center mb-8">
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-500 mb-1">SetGo</p>
          <h1 className="text-2xl font-black text-white">Mis Clubes</h1>
          <p className="text-slate-400 text-sm mt-1">Seleccioná el club en el que querés operar</p>
        </div>

        {/* Card */}
        <div
          className="w-full rounded-3xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-xl"
          style={{ boxShadow: '0 0 0 1px rgba(166,206,57,0.08), 0 24px 60px rgba(4,14,28,0.7)' }}
        >
          {loading ? (
            <div className="flex items-center justify-center gap-3 py-8">
              <div className="w-5 h-5 rounded-full border-2 border-[#A6CE39]/30 border-t-[#A6CE39] animate-spin" />
              <span className="text-slate-400 text-sm">Cargando clubes...</span>
            </div>
          ) : clubes.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-slate-500 text-sm">No pertenecés a ningún club todavía.</p>
              <button
                type="button"
                onClick={() => navigate('/')}
                className="mt-4 text-sm font-semibold transition-colors hover:text-white"
                style={{ color: '#A6CE39' }}
              >
                Volver al inicio
              </button>
            </div>
          ) : (
            <ul className="space-y-3">
              {clubes.map(club => (
                <li key={club.id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/${club.slug}/inicio`)}
                    className="w-full flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3.5 text-left hover:bg-white/[0.08] hover:border-[#A6CE39]/25 transition-all group"
                  >
                    {club.logo_url ? (
                      <img
                        src={club.logo_url}
                        alt={club.nombre}
                        className="w-11 h-11 rounded-full object-cover ring-2 ring-white/10 group-hover:ring-[#A6CE39]/30 transition-all flex-shrink-0"
                      />
                    ) : (
                      <div
                        className="w-11 h-11 rounded-full flex items-center justify-center font-black text-sm flex-shrink-0 ring-2 ring-white/10 group-hover:ring-[#A6CE39]/30 transition-all"
                        style={{ background: 'rgba(166,206,57,0.12)', color: '#A6CE39' }}
                      >
                        {initials(club.nombre)}
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <p className="text-white font-bold text-sm leading-tight truncate">{club.nombre}</p>
                      <p className="text-slate-500 text-[11px] mt-0.5">/{club.slug}</p>
                    </div>

                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-600 group-hover:text-[#A6CE39] transition-colors flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-slate-600 text-xs mt-6">
          © 2026 SetGo
        </p>
      </div>
    </div>
  );
}
