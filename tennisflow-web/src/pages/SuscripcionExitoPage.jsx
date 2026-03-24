import { useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import confetti from 'canvas-confetti';

const PLAN_MESSAGES = {
  pro: {
    emoji: '🎾',
    title: '¡Bienvenido al Plan Pro!',
    subtitle: 'Ahora tenés acceso a 5 torneos simultáneos, 6 canchas y 500 jugadores activos.',
    color: 'from-blue-50 to-sky-50',
    badge: 'bg-blue-100 text-blue-700 border-blue-200',
    btn: 'from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-blue-200',
  },
  premium: {
    emoji: '🏆',
    title: '¡Bienvenido al Plan Grand Slam!',
    subtitle: 'Tenés acceso ilimitado a todas las funciones, incluyendo partidos en vivo y branding propio.',
    color: 'from-amber-50 to-orange-50',
    badge: 'bg-amber-100 text-amber-700 border-amber-200',
    btn: 'from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 shadow-amber-200',
  },
};

const CONFETTI_COLORS_BY_PLAN = {
  pro: ['#3b82f6', '#60a5fa', '#ffffff', '#10b981'],
  premium: ['#f59e0b', '#fbbf24', '#ffffff', '#f97316'],
};

export default function SuscripcionExitoPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const plan = searchParams.get('plan') || 'premium';
  const slug = searchParams.get('slug');

  const msg = PLAN_MESSAGES[plan] || PLAN_MESSAGES.premium;
  const colors = CONFETTI_COLORS_BY_PLAN[plan] || CONFETTI_COLORS_BY_PLAN.premium;

  useEffect(() => {
    const end = Date.now() + 4000;

    const shoot = () => {
      confetti({
        particleCount: 8,
        angle: 60,
        spread: 60,
        origin: { x: 0, y: 0.65 },
        colors,
        gravity: 0.9,
        scalar: 1.1,
      });
      confetti({
        particleCount: 8,
        angle: 120,
        spread: 60,
        origin: { x: 1, y: 0.65 },
        colors,
        gravity: 0.9,
        scalar: 1.1,
      });

      if (Date.now() < end) {
        requestAnimationFrame(shoot);
      }
    };

    shoot();
  }, []);

  const handleGoToDashboard = () => {
    if (slug) {
      navigate(`/${slug}/admin`);
    } else {
      navigate('/mis-clubes');
    }
  };

  return (
    <div className={`min-h-screen bg-gradient-to-br ${msg.color} flex items-center justify-center px-4 py-12`}>
      <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 p-10 max-w-md w-full text-center space-y-6">

        {/* Ícono / emoji */}
        <div className="text-7xl select-none">{msg.emoji}</div>

        {/* Título */}
        <div className="space-y-2">
          <h1 className="text-2xl font-black text-gray-900 leading-tight">{msg.title}</h1>
          <p className="text-gray-500 text-sm leading-relaxed">{msg.subtitle}</p>
        </div>

        {/* Plan badge */}
        <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-bold ${msg.badge}`}>
          ⭐ Plan {plan === 'pro' ? 'Pro' : 'Grand Slam'} activado
        </div>

        {/* Confirmación de pago */}
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl py-3 px-4">
          <p className="text-emerald-700 text-sm font-semibold">✓ Suscripción activada correctamente</p>
          <p className="text-emerald-600 text-xs mt-0.5">Mercado Pago procesó tu método de pago.</p>
        </div>

        {/* CTA principal */}
        <button
          type="button"
          onClick={handleGoToDashboard}
          className={`w-full bg-gradient-to-r ${msg.btn} text-white font-black py-4 rounded-xl transition-all shadow-lg text-base tracking-wide`}
        >
          Ir al Dashboard →
        </button>

        {/* Link secundario */}
        <button
          type="button"
          onClick={() => navigate('/mis-clubes')}
          className="text-gray-400 text-sm hover:text-gray-600 transition-colors"
        >
          Ver todos mis clubes
        </button>
      </div>
    </div>
  );
}
