'use strict';
/**
 * tests/validate_backend.js
 *
 * Suite de validación completa del backend TennisFlow.
 * No requiere Supabase ni Redis — testea lógica pura + fail-safes.
 * Ejecutar: node tests/validate_backend.js
 */

process.env.SUPABASE_URL             = 'http://x';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'x';
process.env.MP_ACCESS_TOKEN          = 'x';

// ─── Colores + helpers ────────────────────────────────────────────────────────
const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN   = '\x1b[36m';
const BOLD   = '\x1b[1m';
const RESET  = '\x1b[0m';

let passed = 0, failed = 0, warned = 0;
const failures = [];
const warnings = [];

const ok   = (label)        => { passed++; console.log(`  ${GREEN}✔${RESET} ${label}`); };
const fail = (label, detail) => { failed++; failures.push({ label, detail }); console.log(`  ${RED}✘${RESET} ${label}${detail ? ` — ${RED}${detail}${RESET}` : ''}`); };
const warn = (label, detail) => { warned++; warnings.push({ label, detail }); console.log(`  ${YELLOW}⚠${RESET} ${label}${detail ? ` — ${YELLOW}${detail}${RESET}` : ''}`); };

function section(title) { console.log(`\n${BOLD}${CYAN}${'─'.repeat(60)}${RESET}\n${BOLD}${title}${RESET}`); }

function assert(condition, label, detail = '') {
  if (condition) ok(label); else fail(label, detail);
}

// ─── Cargar módulos ───────────────────────────────────────────────────────────
const { PLAN_LIMITS }                        = require('../config/planLimits');
const { getPlanLimits }                      = require('../utils/planResolver');
const { calculateChurnScore, classifyChurn } = require('../services/churnService');
const { generateRecommendations }            = require('../services/recommendationService');
const { generateInsights, shouldSuggestUpgrade } = require('../services/insightService');
const { getUpgradeReasons }                  = require('../services/upgradeReasonService');
const { getPlanPressure, pressureToPct, recommendPlan, getPlanCopywriting, NEXT_PLAN } = require('../services/planRecommendationService');
const { trackEvent }                         = require('../utils/analytics');
const { incrementCounter, getCounter }       = require('../utils/analyticsCounters');
const { incrementUsage, getUsage }           = require('../utils/usageTracker');
const { isAvailable }                        = require('../utils/redisClient');

// ═══════════════════════════════════════════════════════════════════════════════
// FASE 1 — Plan Limits
// ═══════════════════════════════════════════════════════════════════════════════
section('FASE 1 — Plan Limits (config/planLimits.js)');

const PLANES = ['basico', 'pro', 'premium', 'test'];
PLANES.forEach((plan) => {
  const l = PLAN_LIMITS[plan];
  assert(l !== undefined, `Plan '${plan}' definido`);
  assert(typeof l.max_torneos_activos !== 'undefined', `Plan '${plan}': max_torneos_activos definido`);
  assert(typeof l.max_partidos_mes   !== 'undefined', `Plan '${plan}': max_partidos_mes definido`);
  assert(typeof l.allow_dobles       === 'boolean',   `Plan '${plan}': allow_dobles es boolean`);
});

// Fallback para plan desconocido → debe ser basico
const unknown = getPlanLimits('inexistente');
assert(unknown === PLAN_LIMITS.basico, 'Fallback plan desconocido → basico');

// premium e Infinity — JSON.stringify los convierte a null
const premLimits = PLAN_LIMITS.premium;
assert(premLimits.max_torneos_activos === Infinity, 'Premium: max_torneos_activos === Infinity');
assert(JSON.stringify({ v: Infinity }) === '{"v":null}', 'Infinity serializa a null en JSON (correcto para HTTP)');

// Dobles
assert(PLAN_LIMITS.basico.allow_dobles === false, 'Basico: allow_dobles = false');
assert(PLAN_LIMITS.pro.allow_dobles    === true,  'Pro:    allow_dobles = true');

// ═══════════════════════════════════════════════════════════════════════════════
// FASE 2 — Churn Score Engine
// ═══════════════════════════════════════════════════════════════════════════════
section('FASE 2 — Churn Score Engine (services/churnService.js)');

const basicoLimits   = PLAN_LIMITS.basico;
const proLimits      = PLAN_LIMITS.pro;
const premiumLimits  = PLAN_LIMITS.premium;

// Caso 1: club completamente inactivo → high
const metricsInactivo = { torneos: 0, partidos: 0, inscripciones: 0, actividad: 0 };
const scoreInactivo   = calculateChurnScore(metricsInactivo, basicoLimits);
const riskInactivo    = classifyChurn(scoreInactivo);
assert(typeof scoreInactivo === 'number', `Club inactivo → score es number (${scoreInactivo})`);
assert(!isNaN(scoreInactivo),             'Club inactivo → score no es NaN');
assert(riskInactivo === 'high',           `Club inactivo → risk='high' (score=${scoreInactivo})`);

// Caso 2: club activo con alta carga de partidos (>= 20% del límite de 1000 → sin penalización) → low
// Con partidos=200/1000: usageRatio=0.2 → no hay penalización → score alto → 'low'
const metricsActivo = { torneos: 5, partidos: 200, inscripciones: 40, actividad: 65 };
const scoreActivo   = calculateChurnScore(metricsActivo, proLimits);
const riskActivo    = classifyChurn(scoreActivo);
assert(typeof scoreActivo === 'number', `Club activo → score es number (${scoreActivo})`);
assert(riskActivo === 'low',            `Club activo (partidos >= 20% límite) → risk='low' (score=${scoreActivo})`);

// Caso 3: actividad media
const metricsMedio = { torneos: 1, partidos: 5, inscripciones: 8, actividad: 14 };
const scoreMedio   = calculateChurnScore(metricsMedio, basicoLimits);
const riskMedio    = classifyChurn(scoreMedio);
assert(['low', 'medium', 'high'].includes(riskMedio), `Actividad media → risk válido ('${riskMedio}')`);

// Determinismo: mismo input → mismo output
const score1 = calculateChurnScore(metricsActivo, proLimits);
const score2 = calculateChurnScore(metricsActivo, proLimits);
assert(score1 === score2, `Determinismo: mismo input → mismo score (${score1})`);

// Infinity en límites — no NaN
const scoreInfinity = calculateChurnScore(metricsActivo, premiumLimits);
assert(!isNaN(scoreInfinity), `Plan premium (Infinity) → score no es NaN (${scoreInfinity})`);

// Validar que classifyChurn cubre todos los rangos
assert(classifyChurn(-100) === 'high',   'classifyChurn(-100) = high');
assert(classifyChurn(0)    === 'medium', 'classifyChurn(0)    = medium');
assert(classifyChurn(49)   === 'medium', 'classifyChurn(49)   = medium');
assert(classifyChurn(50)   === 'low',    'classifyChurn(50)   = low');
assert(classifyChurn(1000) === 'low',    'classifyChurn(1000) = low');

// ═══════════════════════════════════════════════════════════════════════════════
// FASE 3 — Recomendaciones
// ═══════════════════════════════════════════════════════════════════════════════
section('FASE 3 — Recomendaciones (services/recommendationService.js)');

// Club inactivo → reactivation + onboarding
const recsInactivo = generateRecommendations(metricsInactivo, basicoLimits, 'high');
assert(Array.isArray(recsInactivo), 'Club inactivo → recomendaciones es array');
assert(recsInactivo.some(r => r.type === 'reactivation'), 'Club inactivo → tipo reactivation presente');
assert(recsInactivo.some(r => r.type === 'onboarding'),   'Club inactivo → tipo onboarding presente');
assert(recsInactivo.every(r => r.message && r.type),       'Club inactivo → todas tienen type + message');

// Club cerca del límite de partidos → upgrade
const metricsCercaLimite = { torneos: 0, partidos: 85, inscripciones: 10, actividad: 95 };
const recsCercaLimite    = generateRecommendations(metricsCercaLimite, basicoLimits, 'low');
assert(recsCercaLimite.some(r => r.type === 'upgrade'), 'Cerca del límite → tipo upgrade presente');

// Club premium Infinity — NO debe generar upgrade por partidos
const recsInfinity = generateRecommendations(metricsActivo, premiumLimits, 'low');
const hasUpgradeInfinity = recsInfinity.some(r => r.type === 'upgrade');
// Con metricsActivo (torneos=5, partidos=20) y Infinity→ no debe sugerir upgrade
assert(!hasUpgradeInfinity, 'Plan premium (Infinity) → sin recomendación upgrade por límite');

// Alta actividad → engagement
const recsEngagement = generateRecommendations({ torneos: 2, partidos: 30, inscripciones: 50, actividad: 82 }, proLimits, 'low');
assert(recsEngagement.some(r => r.type === 'engagement'), 'Alta actividad → tipo engagement presente');

// Nunca debe romper con valores null/undefined
let recs_safe;
try {
  recs_safe = generateRecommendations({ torneos: 0, partidos: 0, inscripciones: 0, actividad: 0 }, basicoLimits, 'low');
  assert(Array.isArray(recs_safe), 'Edge case: métricas en cero → retorna array sin romper');
} catch (e) {
  fail('Edge case: métricas en cero → ROMPE', e.message);
}

// ═══════════════════════════════════════════════════════════════════════════════
// FASE 4 — Insights (insightService)
// ═══════════════════════════════════════════════════════════════════════════════
section('FASE 4 — Insights (services/insightService.js)');

// Plan basico, 1 torneo → al 100% del límite → limit_exceeded
const limitsTorneos100 = basicoLimits; // max_torneos_activos = 1
const insightsExcedido = generateInsights({ torneos: 1, partidos: 0, inscripciones: 0, actividad: 0 }, limitsTorneos100);
assert(insightsExcedido.some(i => i.type === 'limit_exceeded' && i.metric === 'max_torneos_activos'),
  'Torneo = límite → insight limit_exceeded');

// 0.9 * 1 → no alcanza 90% (0.9 torneos = 0 torneos entero), probar con partidos
const insightsWarning = generateInsights({ torneos: 0, partidos: 91, inscripciones: 0, actividad: 0 }, basicoLimits);
assert(insightsWarning.some(i => i.type === 'limit_warning' && i.metric === 'max_partidos_mes'),
  'Partidos > 90% límite → insight limit_warning');

// Plan premium Infinity — no debe generar limit_exceeded/warning
const insightsPremium = generateInsights(metricsActivo, premiumLimits);
const badInsightPremium = insightsPremium.some(i => ['limit_exceeded', 'limit_warning', 'upgrade_suggestion'].includes(i.type));
assert(!badInsightPremium, 'Plan premium (Infinity) → sin insights de límite');

// usageRatio — 0/0 no debe dar NaN
const insightsCero = generateInsights({ torneos: 0, partidos: 0, inscripciones: 0, actividad: 0 }, basicoLimits);
assert(Array.isArray(insightsCero), 'Métricas cero + basico → array de insights (no rompe)');
assert(insightsCero.some(i => i.type === 'low_usage'), 'actividad=0 → insight low_usage');

// shouldSuggestUpgrade
assert(shouldSuggestUpgrade({ torneos: 1, partidos: 90 }, basicoLimits) === true,  'shouldSuggestUpgrade: activo en límite → true');
assert(shouldSuggestUpgrade({ torneos: 0, partidos: 0 },  basicoLimits) === false, 'shouldSuggestUpgrade: inactivo → false');
assert(shouldSuggestUpgrade(metricsActivo, premiumLimits) === false,               'shouldSuggestUpgrade: premium Infinity → false');

// ═══════════════════════════════════════════════════════════════════════════════
// FASE 5 — Analytics (fail-safe sin Redis)
// ═══════════════════════════════════════════════════════════════════════════════
section('FASE 5 — Analytics fail-safe sin Redis');

const redisOff = !isAvailable();
assert(redisOff, 'Redis NO disponible en entorno de test (esperado — no hay credenciales)');

// trackEvent no debe lanzar aunque Redis esté offline
let trackOk = true;
(async () => {
  try {
    await trackEvent('test_event', { club_id: 'abc', user_id: 'xyz' });
  } catch (e) {
    trackOk = false;
  }
  assert(trackOk, 'trackEvent() sin Redis → no lanza error (fail-safe)');
})();

// incrementCounter sin Redis → fails silently, returns undefined
let counterOk = true;
(async () => {
  try {
    await incrementCounter('club-test', 'torneos');
    const val = await getCounter('club-test', 'torneos');
    assert(val === 0, 'getCounter() sin Redis → devuelve 0 (fail-safe)');
  } catch (e) {
    counterOk = false;
  }
  assert(counterOk, 'incrementCounter/getCounter sin Redis → no lanza error');
})();

// incrementUsage / getUsage sin Redis
let usageOk = true;
(async () => {
  try {
    await incrementUsage('club-test', 'partidos_mes');
    const val = await getUsage('club-test', 'partidos_mes');
    assert(val === 0, 'getUsage() sin Redis → devuelve 0 (fail-safe)');
  } catch (e) {
    usageOk = false;
  }
  assert(usageOk, 'incrementUsage/getUsage sin Redis → no lanza error');
})();

// ═══════════════════════════════════════════════════════════════════════════════
// FASE 6 — Edge Cases críticos
// ═══════════════════════════════════════════════════════════════════════════════
section('FASE 6 — Edge cases críticos');

// Churn con valores extremos
const scoreMax  = calculateChurnScore({ torneos: 9999, partidos: 9999, inscripciones: 9999, actividad: 99999 }, proLimits);
assert(!isNaN(scoreMax) && isFinite(scoreMax), `Valores extremos → score finito (${scoreMax})`);

// Churn con límite 0 — no debe dividir por cero
const limitsZero = { max_torneos_activos: 0, max_jugadores: 0, max_partidos_mes: 0, allow_dobles: false };
let scoreZeroLimits;
try {
  scoreZeroLimits = calculateChurnScore({ torneos: 5, partidos: 5, inscripciones: 0, actividad: 10 }, limitsZero);
  assert(!isNaN(scoreZeroLimits), `Límites en 0 → churn score no es NaN (${scoreZeroLimits})`);
} catch (e) {
  fail('Límites en 0 → churn ROMPE', e.message);
}

// Insights con límite 0
let insightsZeroLimits;
try {
  insightsZeroLimits = generateInsights({ torneos: 5, partidos: 5, inscripciones: 0, actividad: 10 }, limitsZero);
  assert(Array.isArray(insightsZeroLimits), 'Límites en 0 → insights son array (no rompe)');
} catch (e) {
  fail('Límites en 0 → insights ROMPE', e.message);
}

// Recomendaciones con limits null-like
try {
  const recsNull = generateRecommendations(metricsInactivo, { max_partidos_mes: null, max_torneos_activos: null }, 'high');
  assert(Array.isArray(recsNull), 'Límites null → recomendaciones son array (no rompe)');
} catch (e) {
  fail('Límites null → recomendaciones ROMPE', e.message);
}

// Club con torneos > límite en básico → upgrade esperado en recs
const metricsSup = { torneos: 1, partidos: 90, inscripciones: 20, actividad: 111 };
const recsSup    = generateRecommendations(metricsSup, basicoLimits, 'low');
assert(recsSup.some(r => r.type === 'upgrade'), `Torneos y partidos ≥ límite basico → upgrade recomendado`);

// getPlanLimits con null → basico
const limitsNull = getPlanLimits(null);
assert(limitsNull === PLAN_LIMITS.basico, 'getPlanLimits(null) → basico');
const limitsUndef = getPlanLimits(undefined);
assert(limitsUndef === PLAN_LIMITS.basico, 'getPlanLimits(undefined) → basico');

// ═══════════════════════════════════════════════════════════════════════════════
// FASE 7 — Performance: funciones puras (1000 iteraciones)
// ═══════════════════════════════════════════════════════════════════════════════
section('FASE 7 — Performance (funciones puras, 1000 iteraciones)');

const ITERS = 1000;

const t0churn = Date.now();
for (let i = 0; i < ITERS; i++) {
  calculateChurnScore(metricsActivo, proLimits);
  classifyChurn(42);
}
const dtChurn = Date.now() - t0churn;
assert(dtChurn < 200, `calculateChurnScore x${ITERS} → ${dtChurn}ms (< 200ms)`);
if (dtChurn >= 50) warn(`calculateChurnScore x${ITERS} tardó ${dtChurn}ms (observar)`);

const t0ins = Date.now();
for (let i = 0; i < ITERS; i++) {
  generateInsights(metricsActivo, proLimits);
  shouldSuggestUpgrade(metricsActivo, proLimits);
}
const dtIns = Date.now() - t0ins;
assert(dtIns < 200, `generateInsights x${ITERS} → ${dtIns}ms (< 200ms)`);

const t0rec = Date.now();
for (let i = 0; i < ITERS; i++) {
  generateRecommendations(metricsActivo, proLimits, 'low');
}
const dtRec = Date.now() - t0rec;
assert(dtRec < 200, `generateRecommendations x${ITERS} → ${dtRec}ms (< 200ms)`);

// Verificar que getCounter es O(1) en signature (sin Redis devuelve inmediatamente)
const t0counter = Date.now();
const counterPromises = Array.from({ length: 100 }, (_, i) =>
  getCounter(`club-${i}`, 'torneos')
);
Promise.all(counterPromises).then((vals) => {
  const dtCounter = Date.now() - t0counter;
  assert(vals.every(v => v === 0), 'getCounter x100 sin Redis → todos devuelven 0');
  // 600ms: threshold razonable para 100 microtasks async en entorno local (Windows)
  assert(dtCounter < 600, `getCounter x100 sin Redis → ${dtCounter}ms (< 600ms, O(1) fail-safe)`);
});

// ═══════════════════════════════════════════════════════════════════════════════
// FASE 8 — Consistencia de tipos de respuesta
// ═══════════════════════════════════════════════════════════════════════════════
section('FASE 8 — Consistencia de tipos de respuesta');

// churn_score siempre number
[metricsInactivo, metricsActivo, metricsMedio].forEach((m, i) => {
  const s = calculateChurnScore(m, proLimits);
  assert(typeof s === 'number' && !isNaN(s), `Métricas[${i}] → churn_score es número válido (${s})`);
});

// churn_risk siempre en {'high','medium','low'}
[-100, -1, 0, 1, 49, 50, 100, 1000].forEach((score) => {
  const risk = classifyChurn(score);
  assert(['high', 'medium', 'low'].includes(risk), `classifyChurn(${score}) → '${risk}' es valor válido`);
});

// recommendations siempre es array de objetos con type + message
const recsCheck = generateRecommendations(metricsActivo, proLimits, 'medium');
assert(Array.isArray(recsCheck), 'generateRecommendations → siempre array');
recsCheck.forEach((r, i) => {
  assert(typeof r.type    === 'string' && r.type.length    > 0, `Rec[${i}] → type es string no vacío`);
  assert(typeof r.message === 'string' && r.message.length > 0, `Rec[${i}] → message es string no vacío`);
});

// insights siempre array con type + metric + message
const insCheck = generateInsights({ torneos: 1, partidos: 91, inscripciones: 5, actividad: 97 }, basicoLimits);
assert(Array.isArray(insCheck), 'generateInsights → siempre array');
insCheck.forEach((ins, i) => {
  assert(typeof ins.type    === 'string', `Insight[${i}] → type es string`);
  assert(typeof ins.metric  === 'string', `Insight[${i}] → metric es string`);
  assert(typeof ins.message === 'string', `Insight[${i}] → message es string`);
});

// ═══════════════════════════════════════════════════════════════════════════════
// FASE 9 — Churn: supresión de alertas en clubs nuevos
// ═══════════════════════════════════════════════════════════════════════════════
section('FASE 9 — Supresión alerta high_churn_risk en clubs nuevos');

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// Helper que replica la lógica del controller
const shouldAlert = (churnRisk, createdAt) => {
  const clubAgeMs = createdAt ? Date.now() - new Date(createdAt).getTime() : Infinity;
  const isNewClub = clubAgeMs < SEVEN_DAYS_MS;
  return churnRisk === 'high' && !isNewClub;
};

// Club nuevo (1 día de vida) → NO alerta aunque score sea ultra-negativo
assert(!shouldAlert('high', new Date(Date.now() - 1  * 24 * 60 * 60 * 1000).toISOString()), 'Club 1 día  → NO alerta high_churn_risk');
assert(!shouldAlert('high', new Date(Date.now() - 6  * 24 * 60 * 60 * 1000).toISOString()), 'Club 6 días → NO alerta high_churn_risk');
// Exactamente 7 días → aún no alerta (< SEVEN_DAYS_MS)
assert(!shouldAlert('high', new Date(Date.now() - 7  * 24 * 60 * 60 * 1000 + 1000).toISOString()), 'Club < 7 días → NO alerta high_churn_risk');
// Club viejo (8 días, riesgo high) → SÍ alerta
assert( shouldAlert('high', new Date(Date.now() - 8  * 24 * 60 * 60 * 1000).toISOString()), 'Club 8 días + high risk → SÍ alerta');
assert( shouldAlert('high', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()), 'Club 30 días + high risk → SÍ alerta');
// Risk no-high con club viejo → nunca alerta
assert(!shouldAlert('medium', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()), 'Risk medium → NO alerta (sin importar edad)');
assert(!shouldAlert('low',    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()), 'Risk low    → NO alerta (sin importar edad)');
// created_at null / faltante → Infinity de edad → no se considera nuevo → sí alerta si high
assert( shouldAlert('high', null), 'created_at null + high → SÍ alerta (fail-safe: Infinity de edad)');

// ═══════════════════════════════════════════════════════════════════════════════
// FASE 11 — Upgrade Reason Engine (upgradeReasonService)
// ═══════════════════════════════════════════════════════════════════════════════
section('FASE 11 — Upgrade Reason Engine (services/upgradeReasonService.js)');

const basicoL  = PLAN_LIMITS.basico;
const proL     = PLAN_LIMITS.pro;
const premiumL = PLAN_LIMITS.premium;

// plan premium → sin reasons nunca
const reasonsPremium = getUpgradeReasons({ usage: { torneos: 999, canchas: 999 }, limits: premiumL, plan: 'premium' });
assert(reasonsPremium.length === 0, 'Plan premium → 0 upgrade reasons');

// plan basico al límite de torneos → limit_reached
const reasonsTorneoLimite = getUpgradeReasons({ usage: { torneos: 1, canchas: 0, jugadores_activos: null, partidos: 0 }, limits: basicoL, plan: 'basico' });
assert(reasonsTorneoLimite.some(r => r.type === 'limit_reached' && r.metric === 'torneos'), 'Torneo = límite → reason limit_reached torneos');
assert(reasonsTorneoLimite.every(r => typeof r.pct === 'number'), 'Todas las reasons tienen pct numérico');

// warning en torneos al 80%+
const reasonsWarning = getUpgradeReasons({ usage: { torneos: 4, canchas: 0, jugadores_activos: null, partidos: 0 }, limits: proL, plan: 'pro' });
assert(reasonsWarning.some(r => r.type === 'warning' && r.metric === 'torneos'), 'Torneos al 80% → reason warning');

// canchas nulas → skip silencioso
const reasonsNoCanchas = getUpgradeReasons({ usage: { torneos: 0, canchas: null, jugadores_activos: null, partidos: 0 }, limits: basicoL, plan: 'basico' });
assert(!reasonsNoCanchas.some(r => r.metric === 'canchas'), 'canchas=null → sin reason de canchas');

// partidos al 100% del límite basico
const reasonsPartidos = getUpgradeReasons({ usage: { torneos: 0, canchas: null, jugadores_activos: null, partidos: 100 }, limits: basicoL, plan: 'basico' });
assert(reasonsPartidos.some(r => r.type === 'limit_reached' && r.metric === 'partidos'), 'Partidos = límite → reason limit_reached partidos');

// Determinismo
const r1 = getUpgradeReasons({ usage: { torneos: 1, canchas: 2, jugadores_activos: 45, partidos: 90 }, limits: basicoL, plan: 'basico' });
const r2 = getUpgradeReasons({ usage: { torneos: 1, canchas: 2, jugadores_activos: 45, partidos: 90 }, limits: basicoL, plan: 'basico' });
assert(JSON.stringify(r1) === JSON.stringify(r2), 'getUpgradeReasons → determinista');

// ─── Plan Recommendation Service ─────────────────────────────────────────────
section('FASE 11b — Plan Recommendation Service');

// getPlanPressure — sin uso → 0
const pressureZero = getPlanPressure({ usage: { torneos: 0, canchas: 0, jugadores_activos: 0, partidos: 0 }, limits: basicoL });
assert(pressureZero === 0, `getPlanPressure: sin uso → 0 (${pressureZero})`);

// presión con Infinity → 0 (no divide por Infinity)
const pressureInfinity = getPlanPressure({ usage: { torneos: 999, canchas: 999, jugadores_activos: 999, partidos: 999 }, limits: premiumL });
assert(pressureInfinity === 0, `getPlanPressure: premium (Infinity) → 0 (${pressureInfinity})`);

// presión al límite de un recurso → >= 1
const pressureAtLimit = getPlanPressure({ usage: { torneos: 1, canchas: 0, jugadores_activos: 0, partidos: 0 }, limits: basicoL });
assert(pressureAtLimit >= 1, `getPlanPressure: torneos al límite → >= 1 (${pressureAtLimit})`);

// pressureToPct
assert(pressureToPct(0)   === 0,   'pressureToPct(0) = 0');
assert(pressureToPct(1)   === 50,  'pressureToPct(1) = 50');
assert(pressureToPct(2)   === 100, 'pressureToPct(2) = 100');
assert(pressureToPct(999) === 100, 'pressureToPct(999) = 100 (capped)');

// recommendPlan — sin presión → null
const recNull = recommendPlan({ usage: { torneos: 0, canchas: 0, jugadores_activos: 0, partidos: 0 }, limits: basicoL, currentPlan: 'basico' });
assert(recNull === null, 'recommendPlan: uso 0 → null');

// recommendPlan — con alta presión → 'pro'
const recPro = recommendPlan({ usage: { torneos: 1, canchas: 2, jugadores_activos: 45, partidos: 90 }, limits: basicoL, currentPlan: 'basico' });
assert(recPro === 'pro', `recommendPlan: basico alta presión → 'pro' (got '${recPro}')`);

// recommendPlan — premium → null siempre
const recPremNull = recommendPlan({ usage: { torneos: 999, canchas: 999, jugadores_activos: 999, partidos: 999 }, limits: premiumL, currentPlan: 'premium' });
assert(recPremNull === null, 'recommendPlan: premium → null');

// NEXT_PLAN map
assert(NEXT_PLAN.basico   === 'pro',     "NEXT_PLAN.basico = 'pro'");
assert(NEXT_PLAN.pro      === 'premium', "NEXT_PLAN.pro = 'premium'");
assert(NEXT_PLAN.premium  === null,      'NEXT_PLAN.premium = null');

// getPlanCopywriting
assert(typeof getPlanCopywriting('basico', 0)   === 'string', 'getPlanCopywriting basico idle → string');
assert(typeof getPlanCopywriting('basico', 2)   === 'string', 'getPlanCopywriting basico maxed → string');
assert(typeof getPlanCopywriting('premium', 0)  === 'string', 'getPlanCopywriting premium → string');
assert(getPlanCopywriting('basico', 2).length   > 0,         'getPlanCopywriting basico → no vacío');

// PLAN_LIMITS ahora tiene max_canchas
assert(typeof basicoL.max_canchas === 'number', 'PLAN_LIMITS.basico.max_canchas definido');
assert(basicoL.max_canchas === 2,               'PLAN_LIMITS.basico.max_canchas = 2');
assert(proL.max_canchas    === 6,               'PLAN_LIMITS.pro.max_canchas = 6');
assert(premiumL.max_canchas === Infinity,        'PLAN_LIMITS.premium.max_canchas = Infinity');

// ═══════════════════════════════════════════════════════════════════════════════
// FASE 12 — Carga del index.js completo (regresión de arranque)
// ═══════════════════════════════════════════════════════════════════════════════
section('FASE 12 — Regresión: arranque de la app sin errores');

let appLoaded = false;
try {
  require('../index');
  appLoaded = true;
} catch (e) {
  fail('require(index.js) → ROMPE al arrancar', e.message);
}
assert(appLoaded, 'index.js carga completamente sin errores');

// ═══════════════════════════════════════════════════════════════════════════════
// INFORME FINAL
// ═══════════════════════════════════════════════════════════════════════════════
setTimeout(() => {
  const total = passed + failed + warned;
  section('INFORME FINAL');
  console.log(`\n  ${BOLD}Tests ejecutados: ${total}${RESET}`);
  console.log(`  ${GREEN}✔ Pasados:    ${passed}${RESET}`);
  if (warned) console.log(`  ${YELLOW}⚠ Warnings:   ${warned}${RESET}`);
  if (failed) {
    console.log(`  ${RED}✘ Fallidos:   ${failed}${RESET}`);
    console.log(`\n${BOLD}${RED}ERRORES CRÍTICOS:${RESET}`);
    failures.forEach(({ label, detail }) => {
      console.log(`  ${RED}→ ${label}${detail ? ` [${detail}]` : ''}${RESET}`);
    });
  }
  if (warnings.length) {
    console.log(`\n${BOLD}${YELLOW}WARNINGS:${RESET}`);
    warnings.forEach(({ label, detail }) => {
      console.log(`  ${YELLOW}→ ${label}${detail ? ` [${detail}]` : ''}${RESET}`);
    });
  }

  const estado = failed === 0 ? `${GREEN}${BOLD}✔ OK — LISTO PARA PRODUCCIÓN${RESET}`
               : failed <= 2  ? `${YELLOW}${BOLD}⚠ WARN — Revisar errores menores${RESET}`
               :                `${RED}${BOLD}✘ FAIL — Errores críticos detectados${RESET}`;

  console.log(`\n  Estado general: ${estado}\n`);

  process.exit(failed > 0 ? 1 : 0);
}, 500); // dar tiempo a las promesas async
