'use strict';

/**
 * routes/clubRoutes.js
 *
 * Rutas de información del club para el club logueado.
 * Montadas en /api/club
 */

const express           = require('express');
const router            = express.Router();
const { requireAuth, requireAdmin } = require('../middlewares/auth');
const { getClubUsage, getClubAnalytics } = require('../controllers/clubController');

// GET /api/club/usage — Plan activo + límites + uso mensual del club
router.get('/usage',     requireAuth, requireAdmin, getClubUsage);

// GET /api/club/analytics — Métricas de actividad + insights automáticos
router.get('/analytics', requireAuth, requireAdmin, getClubAnalytics);

module.exports = router;
