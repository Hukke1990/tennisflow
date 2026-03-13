import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconArrowRight, IconSpark, IconTrophy, IconUsers } from '../components/icons/UiIcons';
import { DEFAULT_CLUB_SLUG, buildClubPath } from '../context/ClubContext';

const normalizeSlug = (value) => String(value || '')
  .toLowerCase()
  .trim()
  .replace(/[^a-z0-9-]/g, '-')
  .replace(/-+/g, '-')
  .replace(/^-|-$/g, '');

export default function LandingPage() {
  const navigate = useNavigate();
  const [clubInput, setClubInput] = useState('');

  const resolvedSlug = useMemo(() => {
    const nextSlug = normalizeSlug(clubInput);
    return nextSlug || DEFAULT_CLUB_SLUG;
  }, [clubInput]);

  const goToClub = (slug) => {
    const target = normalizeSlug(slug) || DEFAULT_CLUB_SLUG;
    navigate(buildClubPath(target));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    goToClub(clubInput);
  };

  return (
    <div className="min-h-screen overflow-hidden bg-[#070b17] text-white">
      <div className="pointer-events-none absolute inset-0 opacity-60">
        <div className="absolute -top-24 -left-16 h-72 w-72 rounded-full bg-emerald-500/20 blur-3xl" />
        <div className="absolute top-1/4 -right-16 h-72 w-72 rounded-full bg-cyan-500/20 blur-3xl" />
        <div className="absolute bottom-0 left-1/4 h-64 w-64 rounded-full bg-teal-500/10 blur-3xl" />
      </div>

      <main className="relative mx-auto flex w-full max-w-6xl flex-col px-5 py-10 sm:px-8 lg:px-12">
        <header className="flex items-center justify-between">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-1.5 text-sm font-semibold text-emerald-200">
            <IconSpark className="h-4 w-4" />
            Gestion moderna para clubes de tenis
          </div>
        </header>

        <section className="mt-12 grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <h1 className="max-w-2xl text-4xl font-black leading-tight sm:text-5xl lg:text-6xl">
              TennisFlow ordena tu club en una sola pantalla.
            </h1>
            <p className="mt-5 max-w-xl text-base text-slate-300 sm:text-lg">
              Gestiona torneos, rankings y comunicación con tus jugadores con un flujo simple y rápido.
              Entra directo por el subdominio lógico de tu club.
            </p>

            <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-3 sm:flex-row">
              <label className="sr-only" htmlFor="clubSlugInput">Slug del club</label>
              <input
                id="clubSlugInput"
                value={clubInput}
                onChange={(event) => setClubInput(event.target.value)}
                placeholder="Nombre del club"
                className="w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-base text-white placeholder:text-slate-500 focus:border-emerald-400/60 focus:outline-none"
              />
              <button
                type="submit"
                disabled={!clubInput.trim()}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-6 py-3 text-sm font-extrabold uppercase tracking-wide text-white transition hover:from-emerald-400 hover:to-cyan-400"
              >
                Ir al club
                <IconArrowRight className="h-4 w-4" />
              </button>
            </form>
          </div>

          <aside className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm sm:p-8">
            <h2 className="text-lg font-bold text-white">Por que TennisFlow</h2>
            <ul className="mt-5 space-y-4 text-sm text-slate-300">
              <li className="flex items-start gap-3">
                <span className="mt-0.5 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-2 text-emerald-300">
                  <IconTrophy className="h-4 w-4" />
                </span>
                Torneos y cuadros actualizados en tiempo real para jugadores y admins.
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-0.5 rounded-xl border border-cyan-400/30 bg-cyan-400/10 p-2 text-cyan-300">
                  <IconUsers className="h-4 w-4" />
                </span>
                Cada club tiene su propia entrada y su propia identidad visual.
              </li>
            </ul>
            <p className="mt-6 rounded-2xl border border-white/10 bg-[#091124] px-4 py-3 text-xs text-slate-400">
              Si ya tienes URL de club, abre directo: <span className="font-semibold text-slate-200">/{resolvedSlug}</span>
            </p>
          </aside>
        </section>
      </main>
    </div>
  );
}
