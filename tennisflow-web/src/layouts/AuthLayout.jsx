import { useState } from 'react';
import { Outlet, Link } from 'react-router-dom';
import { useClub, useClubPath } from '../context/ClubContext';
import { IconTennisBall } from '../components/icons/UiIcons';

export default function AuthLayout({ children = null }) {
  const toClubPath = useClubPath();
  const { club } = useClub();
  const [logoError, setLogoError] = useState(false);

  const clubName = String(club?.nombre || '').trim();
  const logoUrl = String(club?.logo_url || '').trim();
  const showLogo = Boolean(logoUrl) && !logoError;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0f1e] via-[#0d1a2d] to-[#071225] flex flex-col items-center justify-center px-4">
      {/* Logo */}
      <Link to={toClubPath('/')} className="flex items-center gap-3 mb-10 group">
        <div className="w-12 h-12 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-900/50 group-hover:scale-105 transition-transform overflow-hidden">
          {showLogo ? (
            <img
              src={logoUrl}
              alt={clubName || 'Logo del club'}
              onError={() => setLogoError(true)}
              className="w-full h-full object-cover"
            />
          ) : (
            <IconTennisBall className="h-6 w-6" />
          )}
        </div>
        <div className="flex flex-col">
          <span className="text-white font-black text-3xl tracking-tight leading-none">
            Tennis<span className="text-emerald-400">Flow</span>
          </span>
          {clubName && (
            <span className="text-emerald-300/90 text-xs font-bold uppercase tracking-[0.14em] mt-1">
              {clubName}
            </span>
          )}
        </div>
      </Link>
      
      {/* Card centrada */}
      <div className="w-full max-w-md bg-white/5 rounded-2xl border border-white/10 shadow-2xl shadow-black/50 p-8 backdrop-blur-sm">
        {children ?? <Outlet />}
      </div>
      
      <p className="mt-8 text-gray-600 text-xs">© 2026 TennisFlow. Todos los derechos reservados.</p>
    </div>
  );
}
