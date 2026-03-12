import { Link, useLocation } from 'react-router-dom';
import { DEFAULT_CLUB_SLUG, buildClubPath } from '../context/ClubContext';

export default function ClubNotFoundPage() {
  const location = useLocation();
  const requestedClub = String(location.state?.clubSlug || '').trim();

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0f1e] via-[#0d1a2d] to-[#071225] flex items-center justify-center px-4">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-white/5 p-8 text-center shadow-2xl shadow-black/40">
        <p className="text-emerald-300 text-xs font-bold uppercase tracking-[0.2em]">Error 404</p>
        <h1 className="mt-3 text-3xl font-black text-white">Club no encontrado</h1>
        <p className="mt-3 text-sm text-gray-300">
          {requestedClub
            ? `No existe un club con el slug "${requestedClub}".`
            : 'No pudimos resolver el club solicitado.'}
        </p>

        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            to={buildClubPath(DEFAULT_CLUB_SLUG, '/inicio')}
            className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white px-4 py-2.5 text-sm font-bold hover:from-emerald-400 hover:to-teal-400 transition-all"
          >
            Ir al club demo
          </Link>
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-xl border border-white/20 text-gray-200 px-4 py-2.5 text-sm font-semibold hover:bg-white/10 transition-colors"
          >
            Volver al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}
