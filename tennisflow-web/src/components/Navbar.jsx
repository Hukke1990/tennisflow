import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useClub, useClubPath } from '../context/ClubContext';
import setGoMarkFallback from '../assets/setgo-mark.svg';
import { IconSettings } from './icons/UiIcons';

const navLinks = [
  { to: '/inicio', label: 'Inicio' },
  { to: '/torneos', label: 'Torneos' },
  { to: '/rankings', label: 'Rankings' },
];

export default function Navbar() {
  const logoVersion = '20260313-1';
  const location = useLocation();
  const navigate = useNavigate();
  const { club } = useClub();
  const toClubPath = useClubPath();
  const { user, perfil, signOut, isAdmin, rolReal } = useAuth();
  const [avatarError, setAvatarError] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [logoSrc, setLogoSrc] = useState(`/SetGo.png?v=${logoVersion}`);
  const [logoFallbackApplied, setLogoFallbackApplied] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate(toClubPath('/login'));
  };

  const iniciales = perfil?.nombre_completo
    ? perfil.nombre_completo.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : user?.email?.[0]?.toUpperCase() ?? '?';

  const fotoPerfil = perfil?.foto_url_resolved || perfil?.foto_url || '';

  useEffect(() => {
    setAvatarError(false);
  }, [fotoPerfil]);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const isActiveLink = (to) => {
    const resolvedPath = toClubPath(to);
    return location.pathname === resolvedPath || location.pathname.startsWith(`${resolvedPath}/`);
  };

  const clubLabel = String(club?.nombre || '').trim();

  return (
    <header className="sticky top-0 z-50 bg-[#0a0f1e]/95 border-b border-white/10 shadow-lg backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* Logo */}
          <Link to={toClubPath('/inicio')} className="flex items-center gap-2.5 group min-w-0">
            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg bg-white/[0.04] ring-1 ring-white/10 transition-transform group-hover:scale-105">
              <img
                src={logoSrc}
                alt="Logo de SetGo"
                className="h-8 w-8 object-contain"
                onError={() => {
                  if (!logoFallbackApplied) {
                    setLogoSrc(setGoMarkFallback);
                    setLogoFallbackApplied(true);
                  }
                }}
              />
            </div>
            <div className="min-w-0">
              <span className="text-white font-black text-xl tracking-tight leading-none block">
                Set<span className="text-[#A6CE39]">Go</span>
              </span>
              {clubLabel && (
                <span className="hidden sm:block text-[10px] uppercase tracking-[0.16em] text-emerald-300/90 font-bold truncate max-w-[220px]">
                  {clubLabel}
                </span>
              )}
            </div>
          </Link>

          {/* Links centrales */}
          <nav className="hidden md:flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.04] p-1">
            {navLinks.map(({ to, label }) => {
              const resolvedPath = toClubPath(to);
              const isActive = isActiveLink(to);
              return (
                <button
                  key={to}
                  type="button"
                  onClick={() => navigate(resolvedPath)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                    isActive ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/35 shadow-[inset_0_0_0_1px_rgba(52,211,153,0.08)]'
                             : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </nav>

          {/* Menú de usuario */}
          <div className="flex items-center gap-3">
            {user ? (
              <>
                {isAdmin && (
                  <Link to={toClubPath('/admin')}
                    className="hidden lg:block text-xs font-bold px-3 py-1.5 rounded-lg border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 transition-colors">
                    <span className="inline-flex items-center gap-1.5">
                      <IconSettings className="h-3.5 w-3.5" />
                      Admin
                    </span>
                  </Link>
                )}
                {rolReal === 'super_admin' && (
                  <Link to="/super-admin"
                    className="hidden lg:block text-xs font-bold px-3 py-1.5 rounded-lg border border-sky-500/40 text-sky-300 hover:bg-sky-500/10 transition-colors">
                    Super Admin
                  </Link>
                )}
                <div className="flex items-center gap-2 group relative">
                  <Link to={toClubPath('/perfil')} className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center ring-2 ring-white/10 group-hover:ring-emerald-400/50 transition-all shadow overflow-hidden bg-gradient-to-br from-blue-500 to-indigo-600">
                      {fotoPerfil && !avatarError ? (
                        <img
                          src={fotoPerfil}
                          alt={perfil?.nombre_completo || 'Avatar'}
                          onError={() => setAvatarError(true)}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-white text-xs font-bold">{iniciales}</span>
                      )}
                    </div>
                    <span className="hidden md:block text-sm text-gray-300 font-medium max-w-[120px] truncate">
                      {perfil?.nombre_completo || user.email}
                    </span>
                  </Link>
                  <button onClick={handleSignOut}
                    className="hidden lg:block text-xs text-gray-500 hover:text-red-400 transition-colors px-2 py-1 rounded hover:bg-red-500/10">
                    Salir
                  </button>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <Link to={toClubPath('/login')}
                  className="text-sm font-semibold text-gray-400 hover:text-white transition-colors px-3 py-1.5">
                  Ingresar
                </Link>
                <Link to={toClubPath('/registro')}
                  className="text-sm font-bold px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl hover:from-emerald-400 hover:to-teal-400 transition-all shadow-lg shadow-emerald-900/30">
                  Registrarse
                </Link>
              </div>
            )}

            <button
              type="button"
              onClick={() => setMobileOpen((prev) => !prev)}
              className="md:hidden inline-flex items-center justify-center w-9 h-9 rounded-lg border border-white/15 text-white hover:bg-white/10 transition-colors"
              aria-label={mobileOpen ? 'Cerrar menu' : 'Abrir menu'}
              aria-expanded={mobileOpen}
            >
              <span className="relative w-4 h-4 block">
                <span className={`absolute left-0 top-0 h-0.5 w-4 bg-current rounded transition-transform ${mobileOpen ? 'translate-y-[7px] rotate-45' : ''}`} />
                <span className={`absolute left-0 top-[7px] h-0.5 w-4 bg-current rounded transition-opacity ${mobileOpen ? 'opacity-0' : 'opacity-100'}`} />
                <span className={`absolute left-0 top-[14px] h-0.5 w-4 bg-current rounded transition-transform ${mobileOpen ? '-translate-y-[7px] -rotate-45' : ''}`} />
              </span>
            </button>
          </div>

        </div>

        {mobileOpen && (
          <div className="md:hidden pb-4">
            <div className="rounded-2xl border border-white/10 bg-[#11182d] p-3 shadow-lg space-y-2">
              {navLinks.map(({ to, label }) => {
                const resolvedPath = toClubPath(to);
                const isActive = isActiveLink(to);

                return (
                  <button
                    key={to}
                    type="button"
                    onClick={() => navigate(resolvedPath)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`w-full text-left block rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                      isActive
                        ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25'
                        : 'text-gray-300 hover:bg-white/5 hover:text-white border border-transparent'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}

              {user ? (
                <>
                  {isAdmin && (
                    <Link
                      to={toClubPath('/admin')}
                      className="block rounded-lg px-3 py-2 text-sm font-semibold text-emerald-300 border border-emerald-500/30 bg-emerald-500/10"
                    >
                      Admin
                    </Link>
                  )}
                  {rolReal === 'super_admin' && (
                    <Link
                      to="/super-admin"
                      className="block rounded-lg px-3 py-2 text-sm font-semibold text-sky-300 border border-sky-500/30 bg-sky-500/10"
                    >
                      Super Admin
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="w-full rounded-lg px-3 py-2 text-sm font-semibold text-red-300 border border-red-500/30 bg-red-500/10 text-left"
                  >
                    Salir
                  </button>
                </>
              ) : (
                <>
                  <Link to={toClubPath('/login')} className="block rounded-lg px-3 py-2 text-sm font-semibold text-gray-300 border border-white/10">
                    Ingresar
                  </Link>
                  <Link to={toClubPath('/registro')} className="block rounded-lg px-3 py-2 text-sm font-semibold text-white bg-gradient-to-r from-emerald-500 to-teal-500">
                    Registrarse
                  </Link>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
