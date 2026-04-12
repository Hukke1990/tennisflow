'use strict';

/**
 * routes/healthRoutes.js
 *
 * Endpoints de salud para load balancers, uptime monitors y herramientas de CD.
 *
 * GET /api/health   — liveness  (siempre 200 si el proceso está vivo)
 * GET /api/ready    — readiness (200 si dependencias críticas están OK)
 */

const express  = require('express');
const router   = express.Router();
const supabase = require('../services/supabase');

// ─── Liveness ─────────────────────────────────────────────────────────────────

router.get('/health', (_req, res) => {
  return res.status(200).json({ status: 'ok' });
});

// ─── Readiness ────────────────────────────────────────────────────────────────

router.get('/ready', async (_req, res) => {
  const checks = {};
  let allOk = true;

  // ── Supabase ──────────────────────────────────────────────────────────────
  try {
    const { error } = await supabase
      .from('clubes')
      .select('id')
      .limit(1)
      .maybeSingle();

    checks.supabase = error ? 'error' : 'ok';
    if (error) allOk = false;
  } catch {
    checks.supabase = 'error';
    allOk = false;
  }

  // ── Mercado Pago config ────────────────────────────────────────────────────
  checks.mp = process.env.MP_ACCESS_TOKEN ? 'ok' : 'missing_env';
  if (!process.env.MP_ACCESS_TOKEN) allOk = false;

  // ── Variables críticas ────────────────────────────────────────────────────
  checks.supabaseUrl = process.env.SUPABASE_URL ? 'ok' : 'missing_env';
  if (!process.env.SUPABASE_URL) allOk = false;

  const status = allOk ? 'ready' : 'degraded';
  return res.status(allOk ? 200 : 503).json({ status, ...checks });
});

module.exports = router;
