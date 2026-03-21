import { memo, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useClubPath } from '../context/ClubContext';
import setGoMarkFallback from '../assets/setgo-mark.svg';
import { IconSettings } from './icons/UiIcons';

const navLinks = [
  { to: '/inicio', label: 'Inicio' },
  { to: '/torneos', label: 'Torneos' },
  { to: '/rankings', label: 'Rankings' },
];

const Navbar = memo(function Navbar() {
  const logoVersion = '20260313-1';
  const location = useLocation();
  const navigate = useNavigate();
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

  return (
    <>
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
              <span className="font-rajdhani text-white font-bold text-2xl tracking-[0.03em] leading-none block">
                Set<span className="text-[#A6CE39]">Go</span>
              </span>
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
                {/* Mis Clubes — visible cuando el usuario pertenece a más de un club */}
                {(perfil?.clubIds?.length ?? 0) > 1 && (
                  <Link to={toClubPath('/mis-clubes')}
                    className="hidden lg:block text-xs font-bold px-3 py-1.5 rounded-lg border transition-all duration-200"
                    style={{ borderColor: 'rgba(166,206,57,0.35)', color: '#A6CE39' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(166,206,57,0.10)'; e.currentTarget.style.borderColor = 'rgba(166,206,57,0.6)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.borderColor = 'rgba(166,206,57,0.35)'; }}
                  >
                    Mis Clubes
                  </Link>
                )}
                {isAdmin && (
                  <Link to={toClubPath('/admin')}
                    className="hidden lg:block text-xs font-bold px-3 py-1.5 rounded-lg border border-emerald-400/45 text-emerald-300 bg-transparent hover:bg-emerald-500/16 hover:text-emerald-100 hover:border-emerald-300/70 transition-all duration-200">
                    <span className="inline-flex items-center gap-1.5">
                      <IconSettings className="h-3.5 w-3.5" />
                      Admin
                    </span>
                  </Link>
                )}
                {rolReal === 'super_admin' && (
                  <Link to="/super-admin"
                    className="hidden lg:block text-xs font-bold px-3 py-1.5 rounded-lg border border-sky-400/45 text-sky-300 bg-transparent hover:bg-sky-500/16 hover:text-sky-100 hover:border-sky-300/70 transition-all duration-200">
                    Super Admin
                  </Link>
                )}
                <div className="flex items-center gap-2 group relative">
                  {/* Mobile: toca el avatar para abrir el drawer */}
                  <button
                    type="button"
                    className="md:hidden w-9 h-9 rounded-full flex items-center justify-center ring-2 ring-white/10 active:ring-emerald-400/60 transition-all shadow overflow-hidden bg-gradient-to-br from-blue-500 to-indigo-600"
                    onClick={() => setMobileOpen(prev => !prev)}
                    aria-label="Menú de usuario"
                  >
                    {fotoPerfil && !avatarError ? (
                      <img src={fotoPerfil} alt={perfil?.nombre_completo || 'Avatar'} onError={() => setAvatarError(true)} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-white text-xs font-bold">{iniciales}</span>
                    )}
                  </button>
                  {/* Desktop: link al perfil */}
                  <Link to={toClubPath('/perfil')} className="hidden md:flex items-center gap-2">
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

          </div>

        </div>
      </div>
    </header>

    {/* Mobile user sheet – fuera del header para evitar conflicto con backdrop-filter */}
    {mobileOpen && user && (
      <div
        className="md:hidden fixed inset-0 z-[60]"
        onClick={() => setMobileOpen(false)}
      >
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
        <div
          className="absolute bottom-0 left-0 right-0 bg-[#0d1426] border-t border-white/10 rounded-t-2xl p-5 space-y-1.5"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.25rem)' }}
          onClick={e => e.stopPropagation()}
        >
          {/* Info del usuario */}
          <div className="flex items-center gap-3 pb-4 mb-1 border-b border-white/10">
            <div className="w-11 h-11 rounded-full flex items-center justify-center ring-2 ring-white/15 shadow overflow-hidden bg-gradient-to-br from-blue-500 to-indigo-600 shrink-0">
              {fotoPerfil && !avatarError ? (
                <img src={fotoPerfil} alt={perfil?.nombre_completo || 'Avatar'} onError={() => setAvatarError(true)} className="w-full h-full object-cover" />
              ) : (
                <span className="text-white text-sm font-bold">{iniciales}</span>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-white font-semibold text-sm truncate">{perfil?.nombre_completo || user.email}</p>
              <p className="text-gray-400 text-xs truncate">{user.email}</p>
            </div>
          </div>
          {/* Links */}
          <Link
            to={toClubPath('/perfil')}
            onClick={() => setMobileOpen(false)}
            className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-gray-200 hover:bg-white/5 transition-colors"
          >
            Mi Perfil
          </Link>
          {isAdmin && (
            <Link
              to={toClubPath('/admin')}
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-emerald-300 border border-emerald-400/25 hover:bg-emerald-500/10 transition-colors"
            >
              Panel Admin
            </Link>
          )}
          {rolReal === 'super_admin' && (
            <Link
              to="/super-admin"
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-sky-300 border border-sky-400/25 hover:bg-sky-500/10 transition-colors"
            >
              Super Admin
            </Link>
          )}
          <button
            type="button"
            onClick={handleSignOut}
            className="w-full text-left flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-red-400 border border-red-500/20 bg-red-500/5 hover:bg-red-500/15 transition-colors mt-1"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    )}
    </>
  );
});

export default Navbar;
