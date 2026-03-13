import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconTennisBall } from '../components/icons/UiIcons';

export default function LandingPage() {
  const [slug, setSlug] = useState('');
  const navigate = useNavigate();

  const handleSubmit = (e) => {
    e.preventDefault();
    const normalized = slug.trim().toLowerCase().replace(/\s+/g, '-');
    if (normalized) navigate(`/${normalized}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0f1e] via-[#0d1a2d] to-[#071225] flex flex-col items-center justify-center px-4">
      <div className="flex items-center gap-2 mb-10">
        <div className="w-12 h-12 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-900/50">
          <IconTennisBall className="h-6 w-6" />
        </div>
        <span className="text-white font-black text-3xl tracking-tight">
          Tennis<span className="text-emerald-400">Flow</span>
        </span>
      </div>

      <div className="w-full max-w-md bg-white/5 rounded-2xl border border-white/10 shadow-2xl shadow-black/50 p-8 backdrop-blur-sm">
        <h2 className="text-white text-xl font-bold mb-2 text-center">Bienvenido</h2>
        <p className="text-gray-400 text-sm text-center mb-6">Ingresa el nombre de tu club para continuar</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="Nombre del club"
            className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 transition-colors"
          />
          <button
            type="submit"
            disabled={!slug.trim()}
            className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-colors"
          >
            Acceder al club
          </button>
        </form>
      </div>

      <p className="mt-8 text-gray-600 text-xs">2026 TennisFlow. Todos los derechos reservados.</p>
    </div>
  );
}