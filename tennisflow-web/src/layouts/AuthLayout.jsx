import { Outlet, Link } from 'react-router-dom';
import { useClubPath } from '../context/ClubContext';
import { IconTennisBall } from '../components/icons/UiIcons';

export default function AuthLayout() {
  const toClubPath = useClubPath();

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0f1e] via-[#0d1a2d] to-[#071225] flex flex-col items-center justify-center px-4">
      {/* Logo */}
      <Link to={toClubPath('/inicio')} className="flex items-center gap-2 mb-10 group">
        <div className="w-12 h-12 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-900/50 group-hover:scale-105 transition-transform">
          <IconTennisBall className="h-6 w-6" />
        </div>
        <span className="text-white font-black text-3xl tracking-tight">
          Tennis<span className="text-emerald-400">Flow</span>
        </span>
      </Link>
      
      {/* Card centrada */}
      <div className="w-full max-w-md bg-white/5 rounded-2xl border border-white/10 shadow-2xl shadow-black/50 p-8 backdrop-blur-sm">
        <Outlet />
      </div>
      
      <p className="mt-8 text-gray-600 text-xs">© 2026 TennisFlow. Todos los derechos reservados.</p>
    </div>
  );
}
