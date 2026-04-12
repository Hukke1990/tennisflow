const express  = require('express');
const router   = express.Router();
const { requireAuth, requireRole, requireInternalKey } = require('../middlewares/auth');
const { listarEloPendiente, repararEloPartido, listarWebhooksFallidos, retryWebhook } = require('../controllers/repairController');
const metrics  = require('../utils/metrics');

// Todas las rutas internas requieren: JWT válido + rol super_admin + API key interna
const guardInternal = [requireAuth, requireRole(['super_admin']), requireInternalKey];

router.get( '/repair/elo-pendiente',              ...guardInternal, listarEloPendiente);
router.post('/repair/elo-pendiente/:partidoId',   ...guardInternal, repararEloPartido);
router.get( '/repair/webhooks-fallidos',          ...guardInternal, listarWebhooksFallidos);
router.post('/repair/webhook-retry/:logId',       ...guardInternal, retryWebhook);

// ─── Métricas de observabilidad ────────────────────────────────────────────────
// GET /api/internal/metrics  — snapshot en memoria + contadores Redis + time-series
router.get('/metrics', ...guardInternal, async (_req, res) => {
  const snap = metrics.snapshot();

  // Enriquecer con métricas Redis distribuidas + time-series por endpoint
  try {
    const { isAvailable } = require('../utils/redisClient');
    if (isAvailable()) {
      const { getMetrics } = require('../utils/redisCache');
      const [redisCounters, timeSeries] = await Promise.all([
        getMetrics(),
        metrics.getTimeSeries(24),
      ]);
      snap.redis_counters = redisCounters;
      snap.time_series_raw = timeSeries;

      // Agregar hits por endpoint (suma de todas las horas)
      const endpointHits = {};
      for (const [key, val] of Object.entries(timeSeries)) {
        // key format: 'endpoint:/path/normalized:YYYY-MM-DDTHH'
        const parts = key.split(':');
        if (parts[0] === 'endpoint') {
          // reconstruir nombre sin el bucket horario final
          const name = parts.slice(1, -1).join(':');
          endpointHits[name] = (endpointHits[name] || 0) + val;
        }
      }
      snap.endpoint_hits = endpointHits;
    }
  } catch (_) { /* no-op */ }

  return res.status(200).json(snap);
});

// ─── Health PRO ───────────────────────────────────────────────────────────────
// GET /api/internal/health  — Redis + Supabase + MP circuit breaker
router.get('/health', ...guardInternal, async (_req, res) => {
  const health = { status: 'ok', ts: new Date().toISOString(), redis: false, supabase: false, mp: 'unknown' };

  // Redis ping
  try {
    const { isAvailable, getClient } = require('../utils/redisClient');
    if (isAvailable()) {
      await getClient().ping();
      health.redis = true;
    }
  } catch (_) { health.redis = false; }

  // Supabase: query liviana para verificar conectividad
  try {
    const supabase = require('../services/supabase');
    const { error } = await supabase.from('clubes').select('id').limit(1).maybeSingle();
    health.supabase = !error;
    if (error) health.supabase_error = error.message;
  } catch (e) {
    health.supabase = false;
    health.supabase_error = e?.message;
  }

  // MP Circuit Breaker
  try {
    const { getMpCircuitStatus } = require('../services/mpClient');
    const cb = getMpCircuitStatus();
    health.mp          = cb.state.toLowerCase();
    health.mp_failures = cb.failures;
  } catch (_) { health.mp = 'unknown'; }

  // Estado global: degraded si algún componente falla
  if (!health.supabase || health.mp === 'open') health.status = 'degraded';

  return res.status(health.status === 'ok' ? 200 : 503).json(health);
});

// ─── Debug por request_id ──────────────────────────────────────────────────────
// GET /api/internal/request/:id  — trazabilidad a futuro; hoy devuelve instrucciones
router.get('/request/:id', ...guardInternal, (req, res) => {
  const { id } = req.params;
  return res.status(200).json({
    request_id: id,
    hint: 'Filtra logs con request_id para ver la traza completa.',
    log_query:  `request_id:"${id}"`,
    docs:       'https://docs.datadoghq.com/logs/explorer/',
  });
});

// ─── Analytics Global (multi-tenant) ─────────────────────────────────────────
// GET /api/internal/analytics/global  — eventos + top clubs por engagement
router.get('/analytics/global', ...guardInternal, async (_req, res) => {
  try {
    const { getGlobalMetrics } = require('../utils/analyticsAggregator');
    const data = await getGlobalMetrics();
    return res.status(200).json(data);
  } catch (_) {
    return res.status(200).json({ total_events: 0, error: 'redis_unavailable' });
  }
});

// ─── Warmup ───────────────────────────────────────────────────────────────────
// GET /api/internal/warmup  — pre-calienta cache para evitar cold starts en Vercel
// Requiere clubId en query: /api/internal/warmup?club_id=xxx
router.get('/warmup', ...guardInternal, async (req, res) => {
  const clubId = String(req.query.club_id || '').trim();
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!clubId || !UUID_REGEX.test(clubId)) {
    return res.status(400).json({ error: 'club_id válido es requerido.' });
  }

  const results = {};
  const { getRankings }              = require('../services/rankingsService');
  const { obtenerTodosLosTorneos }   = require('../services/torneosService');

  await Promise.allSettled([
    getRankings({ clubId, modalidad: 'Singles', sexo: 'Masculino', categoria: null })
      .then(() => { results.rankings_singles_m = 'ok'; })
      .catch((e) => { results.rankings_singles_m = `error: ${e?.message}`; }),

    getRankings({ clubId, modalidad: 'Singles', sexo: 'Femenino', categoria: null })
      .then(() => { results.rankings_singles_f = 'ok'; })
      .catch((e) => { results.rankings_singles_f = `error: ${e?.message}`; }),

    obtenerTodosLosTorneos({ clubId })
      .then(() => { results.torneos = 'ok'; })
      .catch((e) => { results.torneos = `error: ${e?.message}`; }),
  ]);

  return res.status(200).json({ warmed: true, club_id: clubId, results });
});

module.exports = router;
