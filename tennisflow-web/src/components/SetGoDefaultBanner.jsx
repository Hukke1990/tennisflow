const SETGO_URL = 'https://setgo.ar';

/**
 * Shown in the public CarteleraTorneos for clubs on the Básico plan.
 * Non-dismissable. Encourages clubs to upgrade.
 */
export default function SetGoDefaultBanner() {
  return (
    <div className="mt-8 rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 p-4 flex items-center gap-4 shadow-sm">
      {/* Logo mark */}
      <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-blue-600 flex items-center justify-center text-white font-black text-lg select-none">
        S
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-blue-900 leading-tight">
          Powered by SetGo 🎾
        </p>
        <p className="text-xs text-blue-700 truncate mt-0.5">
          Gestioná tu club de tenis de forma profesional.
        </p>
      </div>

      {/* CTA */}
      <a
        href={SETGO_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-shrink-0 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
      >
        Conocer más
      </a>
    </div>
  );
}
