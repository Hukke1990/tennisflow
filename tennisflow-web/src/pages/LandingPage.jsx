import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import setGoMarkFallback from '../assets/setgo-mark.svg';

export default function LandingPage() {
  const logoVersion = '20260313-1';
  const [slug, setSlug] = useState('');
  const [isContactOpen, setIsContactOpen] = useState(false);
  const [logoSrc, setLogoSrc] = useState(`/SetGo.png?v=${logoVersion}`);
  const [logoFallbackApplied, setLogoFallbackApplied] = useState(false);
  const [requestData, setRequestData] = useState({
    clubName: '',
    cityCountry: '',
    contactName: '',
    phone: '',
    email: '',
  });
  const navigate = useNavigate();
  const contactEmail = 'gastonbordet@gmail.com';

  const handleSubmit = (e) => {
    e.preventDefault();
    const normalized = slug.trim().toLowerCase().replace(/\s+/g, '-');
    if (normalized) navigate(`/${normalized}`);
  };

  const handleRequestFieldChange = (field) => (e) => {
    setRequestData((prev) => ({
      ...prev,
      [field]: e.target.value,
    }));
  };

  const isMobileDevice = () =>
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

  const handleContactSubmit = (e) => {
    e.preventDefault();

    const subject = `Solicitud de alta de club en SetGo - ${requestData.clubName.trim()}`;
    const body = [
      'Hola Gaston, quiero solicitar el alta de mi club en SetGo.',
      '',
      `Nombre del club: ${requestData.clubName.trim()}`,
      `Ciudad/Pais: ${requestData.cityCountry.trim()}`,
      `Nombre de contacto: ${requestData.contactName.trim()}`,
      `Telefono de contacto: ${requestData.phone.trim()}`,
      `Correo de contacto: ${requestData.email.trim()}`,
      '',
      'Gracias.',
    ].join('\n');

    if (isMobileDevice()) {
      // En móvil abre la app de correo nativa
      window.location.href = `mailto:${contactEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    } else {
      // En desktop abre Gmail web en pestaña nueva
      const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(contactEmail)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      const opened = window.open(gmailUrl, '_blank', 'noopener,noreferrer');
      if (!opened) window.location.href = gmailUrl;
    }
    setIsContactOpen(false);
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

            <div className="mt-5 flex w-full flex-col items-center justify-center">
              <img
                src={logoSrc}
                alt="Logo de SetGo"
                className="h-36 w-auto object-contain sm:h-44"
                onError={() => {
                  if (!logoFallbackApplied) {
                    setLogoSrc(setGoMarkFallback);
                    setLogoFallbackApplied(true);
                  }
                }}
              />
              <span className="font-rajdhani -mt-1 text-5xl font-bold tracking-[0.03em] text-slate-100 sm:text-6xl">
                Set<span className="text-[#A6CE39]">Go</span>
              </span>
            </div>

            <h1 className="mt-8 max-w-xl text-4xl font-black leading-tight text-slate-100 sm:text-5xl">
              SetGo ordena tu club en una sola pantalla.
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
            <h2 className="text-xl font-extrabold text-slate-100">Por que SetGo</h2>
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

            <button
              type="button"
              onClick={() => setIsContactOpen(true)}
              className="mt-8 inline-flex w-full items-center justify-center rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-200 transition-colors hover:bg-emerald-500/20"
            >
              Solicitar alta de club por correo
            </button>
          </aside>
        </div>
      </main>

      {isContactOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#010716]/80 px-4 py-8">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#0a1633] p-6 shadow-2xl shadow-black/60 sm:p-7">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-extrabold text-slate-100">Solicitar alta de club</h3>
                <p className="mt-1 text-sm text-slate-300">Completa los datos para abrir Gmail con la informacion lista.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsContactOpen(false)}
                className="rounded-md border border-white/15 px-2 py-1 text-sm text-slate-300 transition-colors hover:bg-white/10"
                aria-label="Cerrar formulario"
              >
                X
              </button>
            </div>

            <form onSubmit={handleContactSubmit} className="space-y-3">
              <input
                type="text"
                value={requestData.clubName}
                onChange={handleRequestFieldChange('clubName')}
                placeholder="Nombre del club"
                required
                className="h-11 w-full rounded-xl border border-white/15 bg-white/5 px-3 text-sm text-white placeholder-slate-500 outline-none transition-colors focus:border-emerald-400"
              />
              <input
                type="text"
                value={requestData.cityCountry}
                onChange={handleRequestFieldChange('cityCountry')}
                placeholder="Ciudad/Pais"
                required
                className="h-11 w-full rounded-xl border border-white/15 bg-white/5 px-3 text-sm text-white placeholder-slate-500 outline-none transition-colors focus:border-emerald-400"
              />
              <input
                type="text"
                value={requestData.contactName}
                onChange={handleRequestFieldChange('contactName')}
                placeholder="Nombre de contacto"
                required
                className="h-11 w-full rounded-xl border border-white/15 bg-white/5 px-3 text-sm text-white placeholder-slate-500 outline-none transition-colors focus:border-emerald-400"
              />
              <input
                type="tel"
                value={requestData.phone}
                onChange={handleRequestFieldChange('phone')}
                placeholder="Telefono de contacto"
                required
                className="h-11 w-full rounded-xl border border-white/15 bg-white/5 px-3 text-sm text-white placeholder-slate-500 outline-none transition-colors focus:border-emerald-400"
              />
              <input
                type="email"
                value={requestData.email}
                onChange={handleRequestFieldChange('email')}
                placeholder="Correo de contacto"
                required
                className="h-11 w-full rounded-xl border border-white/15 bg-white/5 px-3 text-sm text-white placeholder-slate-500 outline-none transition-colors focus:border-emerald-400"
              />

              <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setIsContactOpen(false)}
                  className="h-11 rounded-xl border border-white/20 px-4 text-sm font-semibold text-slate-200 transition-colors hover:bg-white/10"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="h-11 rounded-xl bg-emerald-500 px-4 text-sm font-bold text-[#05281f] transition-colors hover:bg-emerald-400"
                >
                  {isMobileDevice() ? 'Abrir mi correo' : 'Abrir Gmail'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <footer className="relative mx-auto w-full max-w-6xl pb-2 text-center text-xs text-slate-500 sm:text-left">
        2026 SetGo. Todos los derechos reservados.
      </footer>
    </div>
  );
}