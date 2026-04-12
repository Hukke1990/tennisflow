'use strict';

/**
 * utils/metrics.js
 *
 * Contadores en memoria para métricas HTTP y de negocio.
 * Sin dependencias externas — compatible con Vercel serverless.
 *
 * Nota: en entornos serverless cada instancia tiene su propio estado.
 * Para métricas persistentes, exportar a Prometheus/Datadog en el futuro.
 *
 * // TODO: integrar con OpenTelemetry
 * // TODO: export metrics a Prometheus
 * // TODO: conectar Sentry
 */

// ─── Estado interno ───────────────────────────────────────────────────────────

const _state = {
  httpRequestsTotal: 0,
  httpErrorsTotal:   0,
  latencies:         [],           // ms de cada request (cap: 1000)
  byStatus:          {},           // { '2xx': N, '4xx': N, '5xx': N }
  byMethod:          {},           // { 'GET': N, 'POST': N, ... }
  byPath:            {},           // { '/api/torneos': N, ... }
  counters:          {},           // named business counters
  startedAt:         Date.now(),
};

const MAX_LATENCY_SAMPLES = 1000;

// ─── HTTP metrics ─────────────────────────────────────────────────────────────

/**
 * Registra una request HTTP completada.
 * @param {{ method: string, path: string, statusCode: number, duration: number }} opts
 */
const recordRequest = ({ method, path, statusCode, duration }) => {
  _state.httpRequestsTotal += 1;

  const bucket = statusCode >= 500 ? '5xx'
    : statusCode >= 400 ? '4xx'
    : statusCode >= 200 ? '2xx' : 'other';

  if (bucket === '4xx' || bucket === '5xx') _state.httpErrorsTotal += 1;

  _state.byStatus[bucket]  = (_state.byStatus[bucket]  || 0) + 1;
  _state.byMethod[method]  = (_state.byMethod[method]  || 0) + 1;
  _state.byPath[path]      = (_state.byPath[path]      || 0) + 1;

  _state.latencies.push(duration);
  if (_state.latencies.length > MAX_LATENCY_SAMPLES) {
    _state.latencies.shift();
  }
};

// ─── Business counters ────────────────────────────────────────────────────────

/**
 * Incrementa un contador de negocio nombrado.
 *
 * Nombres esperados (no excluyentes):
 *   webhook.processed | webhook.failed | webhook.retried
 *   torneo.inscripcion.success | torneo.inscripcion.conflict
 *   partido.finalizado | elo.actualizado
 *   club.activado | club.error_activacion
 *
 * @param {string} name
 */
const increment = (name) => {
  if (typeof name !== 'string' || !name) return;
  _state.counters[name] = (_state.counters[name] || 0) + 1;

  // Persistir en Redis (fire-and-forget) para métricas distribuidas entre instancias
  try {
    const { isAvailable, getClient } = require('./redisClient');
    if (isAvailable()) {
      getClient().incr(`metric:${name}`).catch(() => {});
    }
  } catch (_) { /* no-op: si redisClient no está disponible no bloqueamos */ }
};

// ─── Snapshot ────────────────────────────────────────────────────────────────

/**
 * Devuelve un snapshot inmutable de las métricas actuales.
 * Seguro para serializar y enviar por HTTP.
 *
 * @returns {object}
 */
const snapshot = () => {
  const latencies = _state.latencies;
  const avg   = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;
  const p95   = latencies.length ? computePercentile(latencies, 95) : 0;
  const p99   = latencies.length ? computePercentile(latencies, 99) : 0;

  return {
    uptimeSeconds:     Math.floor((Date.now() - _state.startedAt) / 1000),
    httpRequestsTotal: _state.httpRequestsTotal,
    httpErrorsTotal:   _state.httpErrorsTotal,
    avgLatency:        avg,
    p95Latency:        p95,
    p99Latency:        p99,
    byStatus:          { ..._state.byStatus },
    byMethod:          { ..._state.byMethod },
    // byPath puede ser extenso; incluir solo los top-15 por tráfico
    topPaths:          topN(_state.byPath, 15),
    counters:          { ..._state.counters },
  };
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const computePercentile = (arr, p) => {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx    = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)] ?? 0;
};

const topN = (obj, n) => Object.entries(obj)
  .sort(([, a], [, b]) => b - a)
  .slice(0, n)
  .reduce((acc, [k, v]) => { acc[k] = v; return acc; }, {});

// ─── Exports ──────────────────────────────────────────────────────────────────

// ─── Time-series metrics (Redis) ─────────────────────────────────────────────

/**
 * Devuelve el bucket horario actual: 'YYYY-MM-DDTHH'
 * Permite agrupar métricas por hora en Redis.
 */
const getTimeBucket = () => new Date().toISOString().slice(0, 13);

/**
 * Incrementa un contador en el bucket horario actual.
 * Fire-and-forget: no bloquea el caller.
 * La clave Redis tiene formato: metric:{name}:{YYYY-MM-DDTHH}
 *
 * @param {string} name - Nombre del contador (ej: 'endpoint:/api/dashboard')
 */
const incrementTimeBucket = (name) => {
  try {
    const { isAvailable, getClient } = require('./redisClient');
    if (!isAvailable()) return;
    const key = `metric:${name}:${getTimeBucket()}`;
    getClient().incr(key).catch(() => {});
  } catch (_) { /* no-op */ }
};

/**
 * Registra un hit por endpoint en Redis (time-series por hora).
 * Fire-and-forget.
 * @param {string} path - Path del request, ej: '/api/dashboard'
 */
const trackEndpoint = (path) => {
  if (!path) return;
  // Normalizar paths con params dinámicos para evitar cardinalidad explosiva
  const normalized = path
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, '/:id')
    .replace(/\/\d+/g, '/:n');
  incrementTimeBucket(`endpoint:${normalized}`);
};

/**
 * Lee todos los contadores de time-series de Redis (últimas N horas).
 * @param {number} [hours=24] - Cuántas horas hacia atrás consultar
 * @returns {Promise<Record<string, number>>}
 */
const getTimeSeries = async (hours = 24) => {
  try {
    const { isAvailable, getClient } = require('./redisClient');
    if (!isAvailable()) return {};

    const redis = getClient();
    const keys = [];
    const now = Date.now();
    for (let h = 0; h < hours; h++) {
      const bucket = new Date(now - h * 3_600_000).toISOString().slice(0, 13);
      // usamos SCAN con patrón para cada bucket — alternativa: guardar índice de claves
      keys.push(bucket);
    }

    // SCAN por todas las claves metric:*
    const allKeys = [];
    let cursor = 0;
    do {
      const [next, batch] = await redis.scan(cursor, { match: 'metric:*', count: 200 });
      cursor = Number(next);
      allKeys.push(...(batch || []));
    } while (cursor !== 0);

    if (!allKeys.length) return {};

    const values = await redis.mget(...allKeys);
    const result = {};
    allKeys.forEach((k, i) => {
      result[k.replace('metric:', '')] = Number(values[i] || 0);
    });
    return result;
  } catch (_) {
    return {};
  }
};

module.exports = { recordRequest, increment, snapshot, trackEndpoint, incrementTimeBucket, getTimeSeries };