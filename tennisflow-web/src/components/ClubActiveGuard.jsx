import { useClub } from '../context/ClubContext';

export default function ClubActiveGuard({ children }) {
  const { club } = useClub();

  // is_active === false (explícito) → bloquear. undefined/null/true → dejar pasar (backward compat)
  if (club && club.is_active === false) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="bg-slate-900 border border-amber-500/30 rounded-2xl p-8 max-w-md w-full text-center">
          <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center mx-auto mb-4 text-2xl">
            🔒
          </div>
          <h2 className="text-white text-xl font-semibold mb-2">Club pendiente de activación</h2>
          <p className="text-slate-400 mb-6">
            Este club está pendiente de activación. Por favor, completá el pago para acceder.
          </p>
          <a
            href={`/activar/${club.id}`}
            className="inline-block bg-amber-500 hover:bg-amber-400 text-slate-900 font-semibold py-2 px-6 rounded-lg transition-colors"
          >
            Activar club
          </a>
        </div>
      </div>
    );
  }

  return children;
}
