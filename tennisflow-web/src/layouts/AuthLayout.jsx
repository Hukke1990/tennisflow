import { Outlet, Link } from 'react-router-dom';
import { useClub } from '../context/ClubContext';
import setGoMark from '../assets/setgo-mark.svg';

export default function AuthLayout({ children = null }) {
  const { club } = useClub();
  const clubName = String(club?.nombre || '').trim() || 'Club';

  return (
    <div className="min-h-screen bg-[#040e1c] flex flex-col items-center justify-center px-4 relative overflow-hidden">

      {/* Decoración de fondo */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(166,206,57,0.13), transparent 65%)' }} />
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 60% 40% at 80% 110%, rgba(166,206,57,0.07), transparent 55%)' }} />
        <img
          src={setGoMark}
          aria-hidden="true"
          className="absolute -bottom-24 -right-24 w-[480px] opacity-[0.03] select-none"
        />
      </div>

      <div className="relative z-10 w-full max-w-sm flex flex-col items-center">

        {/* Logo + marca */}
        <Link to="/" className="flex items-center gap-3 mb-8 group">
          <div className="h-11 w-11 rounded-xl bg-white/[0.06] ring-1 ring-white/10 flex items-center justify-center overflow-hidden shadow-lg group-hover:ring-[#A6CE39]/40 transition-all">
            <img src="/SetGo.png" alt="SetGo" className="h-9 w-9 object-contain" />
          </div>
          <span className="font-rajdhani text-white font-bold text-3xl tracking-[0.03em] leading-none">
            Set<span style={{ color: '#A6CE39' }}>Go</span>
          </span>
        </Link>

        {/* Nombre del club */}
        <p className="text-slate-500 text-[11px] font-bold uppercase tracking-[0.22em] mb-1">Club</p>
        <h1 className="text-white font-black text-3xl sm:text-4xl tracking-tight text-center mb-8 break-words">
          {clubName}
        </h1>

        {/* Card */}
        <div
          className="w-full rounded-3xl border border-white/10 bg-white/[0.04] p-8 backdrop-blur-xl"
          style={{ boxShadow: '0 0 0 1px rgba(166,206,57,0.08), 0 24px 60px rgba(4,14,28,0.7)' }}
        >
          {children ?? <Outlet />}
        </div>

        {/* Footer */}
        <div className="mt-6 flex items-center justify-between w-full">
          <Link
            to="/"
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors font-medium"
          >
            ← Volver al inicio
          </Link>
          <p className="text-slate-600 text-xs">© 2026 SetGo</p>
        </div>
      </div>
    </div>
  );
}