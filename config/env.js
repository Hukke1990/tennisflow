/**
 * config/env.js
 *
 * Centraliza todas las variables de entorno del backend.
 * Importar siempre desde aquí en lugar de acceder a process.env directamente.
 *
 * @example
 *   const { mpToken, frontendUrl } = require('../config/env');
 */

'use strict';

const env = {
  // ─── Servidor ──────────────────────────────────────────────────────────────
  /** Puerto de escucha del servidor Express */
  port: parseInt(process.env.PORT || '3000', 10),

  /** Entorno de ejecución: 'development' | 'production' | 'test' */
  nodeEnv: process.env.NODE_ENV || 'development',

  get isProd()  { return this.nodeEnv === 'production'; },
  get isDev()   { return this.nodeEnv === 'development'; },
  get isTest()  { return this.nodeEnv === 'test'; },

  // ─── Supabase ──────────────────────────────────────────────────────────────
  supabaseUrl:        process.env.SUPABASE_URL         || '',
  supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY || '',

  // ─── Mercado Pago ──────────────────────────────────────────────────────────
  mpAccessToken:   process.env.MP_ACCESS_TOKEN   || '',
  mpWebhookSecret: process.env.MP_WEBHOOK_SECRET || '',
  mpCurrencyId:    process.env.MP_CURRENCY_ID    || 'ARS',

  // ─── Seguridad interna ─────────────────────────────────────────────────────
  /**
   * Puede ser una sola clave o una lista separada por coma (key rotation).
   * Ejemplo: "clave_activa,clave_anterior"
   */
  internalApiKey: process.env.INTERNAL_API_KEY || '',

  // ─── CORS / Frontend ───────────────────────────────────────────────────────
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',

  /**
   * Orígenes CORS permitidos (ya filtrados de undefined).
   * @returns {string[]}
   */
  get allowedOrigins() {
    return [
      this.frontendUrl,
      'http://localhost:5173',
      'http://localhost:3000',
    ].filter(Boolean);
  },
};

module.exports = env;
