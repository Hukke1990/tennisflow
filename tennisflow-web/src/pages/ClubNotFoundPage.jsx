import { Link } from 'react-router-dom';

export default function ClubNotFoundPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0f1e] via-[#0d1a2d] to-[#071225] flex items-center justify-center px-4">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-white/5 p-8 text-center shadow-2xl shadow-black/40">
        <p className="text-emerald-300 text-xs font-bold uppercase tracking-[0.2em]">Club no encontrado</p>
        <h1 className="mt-3 text-3xl font-black text-white">¿Querés tu propio club?</h1>
        <p className="mt-3 text-sm text-gray-300">
          Este club no existe todavía. Ponete en contacto con nosotros y te ayudamos a crear el tuyo en minutos.
        </p>
        <div className="mt-8 flex justify-center">
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
