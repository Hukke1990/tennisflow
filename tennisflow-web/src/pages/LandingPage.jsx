import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconTennisBall } from '../components/icons/UiIcons';

export default function LandingPage() {
  const [slug, setSlug] = useState('');
  const navigate = useNavigate();
  const contactEmail = 'gastonbordet@gmail.com';
  const contactSubject = encodeURIComponent('Solicitud de alta de club en TennisFlow');
  const contactBody = encodeURIComponent(
    'Hola Gaston, quiero solicitar el alta de mi club en TennisFlow.\n\nNombre del club:\nCiudad/Pais:\nTelefono de contacto:\n\nGracias.'
  );
  const contactHref = `mailto:${contactEmail}?subject=${contactSubject}&body=${contactBody}`;

  const handleSubmit = (e) => {
    e.preventDefault();
    const normalized = slug.trim().toLowerCase().replace(/\s+/g, '-');
    if (normalized) navigate(`/${normalized}`);
  };

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-[#040b1f] px-4 py-10 text-white sm:px-6 lg:px-10">
      <div className="pointer-events-none absolute inset-0 opacity-80">
        <div className="absolute -left-32 top-1/3 h-80 w-80 rounded-full bg-cyan-500/15 blur-3xl" />
        <div className="absolute -right-28 top-12 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl" />
      </div>

      <main className="relative mx-auto flex w-full max-w-6xl flex-1 items-center py-6">
        <div className="grid w-full gap-10 lg:grid-cols-[1.2fr_0.95fr] lg:gap-16">
          <section>
            <span className="mb-7 inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-4 py-1.5 text-xs font-semibold text-emerald-200">
              Gestion moderna para clubes de tenis
            </span>

            <div className="mt-5 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 shadow-lg shadow-emerald-900/50">
                <IconTennisBall className="h-6 w-6" />
              </div>
              <span className="text-3xl font-black tracking-tight">
                Tennis<span className="text-emerald-400">Flow</span>
              </span>
            </div>

            <h1 className="mt-8 max-w-xl text-4xl font-black leading-tight text-slate-100 sm:text-5xl">
              TennisFlow ordena tu club en una sola pantalla.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-slate-300 sm:text-lg">
              Gestiona torneos, rankings y comunicacion con tus jugadores de forma simple.
              Entra directo por el nombre de tu club.
            </p>

            <form onSubmit={handleSubmit} className="mt-10 flex max-w-xl flex-col gap-3 sm:flex-row sm:items-center">
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="Nombre del club"
                className="h-12 flex-1 rounded-xl border border-white/15 bg-white/5 px-4 text-white placeholder-slate-500 outline-none transition-colors focus:border-emerald-400"
              />
              <button
                type="submit"
                disabled={!slug.trim()}
                className="h-12 min-w-[150px] rounded-xl bg-emerald-500 px-5 font-bold text-[#05281f] transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Ir al club
              </button>
            </form>
          </section>

          <aside className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/40 backdrop-blur-sm sm:p-8">
            <h2 className="text-xl font-extrabold text-slate-100">Por que TennisFlow</h2>
            <ul className="mt-6 space-y-4 text-sm text-slate-300">
              <li className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-300">•</span>
                <span>Torneos y cuadros actualizados en tiempo real para jugadores y admins.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-md bg-cyan-500/15 text-cyan-300">•</span>
                <span>Cada club tiene su propia entrada y su propia identidad visual.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-md bg-slate-500/20 text-slate-200">•</span>
                <span>Si tu club aun no esta en la app, pedilo por correo en un clic.</span>
              </li>
            </ul>

            <a
              href={contactHref}
              className="mt-8 inline-flex w-full items-center justify-center rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-200 transition-colors hover:bg-emerald-500/20"
            >
              Solicitar alta de club por correo
            </a>
          </aside>
        </div>
      </main>

      <footer className="relative mx-auto w-full max-w-6xl pb-2 text-center text-xs text-slate-500 sm:text-left">
        2026 TennisFlow. Todos los derechos reservados.
      </footer>
    </div>
  );
}