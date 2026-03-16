import { Link, useLocation } from 'react-router-dom';
import { Home, Trophy, BarChart2, User } from 'lucide-react';
import { useClubPath } from '../context/ClubContext';
import { useAuth } from '../context/AuthContext';

const items = [
  { to: '/inicio',    label: 'Inicio',    Icon: Home },
  { to: '/torneos',   label: 'Torneos',   Icon: Trophy },
  { to: '/rankings',  label: 'Rankings',  Icon: BarChart2 },
  { to: '/perfil',    label: 'Perfil',    Icon: User },
];

export default function BottomNav() {
  const location  = useLocation();
  const toClubPath = useClubPath();
  const { user }  = useAuth();

  if (!user) return null;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-[#0a0f1e]/95 border-t border-white/10 backdrop-blur-md"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-center justify-around h-14">
        {items.map(({ to, label, Icon }) => {
          const resolvedPath = toClubPath(to);
          const isActive =
            location.pathname === resolvedPath ||
            location.pathname.startsWith(`${resolvedPath}/`);
          return (
            <Link
              key={to}
              to={resolvedPath}
              className={`flex flex-col items-center gap-0.5 px-4 py-2 rounded-lg transition-colors ${
                isActive ? 'text-emerald-400' : 'text-gray-500 active:text-gray-300'
              }`}
            >
              <Icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 2} />
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
