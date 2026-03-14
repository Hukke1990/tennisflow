import { Outlet, Link } from 'react-router-dom';
import { useClub } from '../context/ClubContext';

export default function AuthLayout({ children = null }) {
  const { club } = useClub();
  const clubName = String(club?.nombre || '').trim() || 'Club';

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0f1e] via-[#0d1a2d] to-[#071225] flex flex-col items-center justify-center px-4 text-center">
      {/* Marca club */}
      <div className="mb-10 w-full max-w-md flex justify-center">
        <h1 className="min-w-0 flex-1 text-white font-black text-4xl tracking-tight leading-tight sm:text-5xl break-words whitespace-normal text-center">
          {clubName}
        </h1>
      </div>

      {/* Card centrada */}
      <div className="w-full max-w-md bg-white/5 rounded-2xl border border-white/10 shadow-2xl shadow-black/50 p-8 backdrop-blur-sm flex flex-col items-center text-center">
        {children ?? <Outlet />}

        <div className="mt-7 border-t border-white/10 pt-5 w-full flex justify-center text-center">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.03] px-3 py-1.5 text-xs font-semibold text-slate-200 transition-colors hover:bg-white/10"
          >
            Volver al inicio
          </Link>
        </div>
      </div>

      <p className="mt-8 text-gray-600 text-xs text-center w-full">2026 SetGo. Todos los derechos reservados.</p>
    </div>
  );
}