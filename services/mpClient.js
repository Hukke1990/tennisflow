/**
 * services/mpClient.js
 *
 * Cliente HTTP para la API de Mercado Pago.
 * Centraliza timeout, autenticación y circuit breaker para todos los controladores.
 */

const logger = require('./logger');
const { createCircuitBreaker } = require('../utils/circuitBreaker');

const MP_API = 'https://api.mercadopago.com';

// Vercel Hobby timeout: 10 s por función. 8 s deja margen.
const MP_FETCH_TIMEOUT_MS  = 8000;
const MP_SLOW_THRESHOLD_MS = 5000;

// Circuit breaker: abre tras 5 fallos consecutivos, se resetea en 30s
const mpCircuit = createCircuitBreaker({
  name:      'mercadopago',
  threshold: 5,
  timeout:   30_000,
});

/**
 * Consulta un recurso de la API de Mercado Pago.
 * Protegido por circuit breaker — si MP falla repetidamente, las llamadas
 * se rechazan inmediatamente sin esperar timeout.
 *
 * @param {string} path  - Ruta relativa, ej: '/preapproval/abc123'
 * @param {string} token - MP_ACCESS_TOKEN
 * @returns {Promise<object>} Datos del recurso
 * @throws {Error} Si la respuesta no es 2xx, hay timeout, o el circuito está abierto
 */
const fetchMp = (path, token) =>
  mpCircuit.execute(async () => {
    const t0  = Date.now();
    const res = await fetch(`${MP_API}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal:  AbortSignal.timeout(MP_FETCH_TIMEOUT_MS),
    });
    const duration = Date.now() - t0;

    if (duration >= MP_SLOW_THRESHOLD_MS) {
      logger.warn('external.slow', {
        service:     'mercadopago',
        path,
        duration_ms: duration,
      });
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`MP ${res.status}: ${text}`);
    }
    return res.json();
  });

/** Estado actual del circuit breaker (para /health y métricas). */
const getMpCircuitStatus = () => mpCircuit.status();

module.exports = { fetchMp, getMpCircuitStatus, MP_FETCH_TIMEOUT_MS };
