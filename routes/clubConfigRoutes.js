const express = require('express');
const { requireAuth, requireAdmin } = require('../middlewares/auth');
const {
  getConfig,
  updateConfig,
  getAds,
  createAd,
  updateAd,
  deleteAd,
  getPublicAds,
} = require('../controllers/clubConfigController');

const router = express.Router();

// ── Public (no auth) ──────────────────────────────────────────────────
// GET /api/club-config/public-ads?club_id=xxx
router.get('/public-ads', getPublicAds);

// ── Admin only ────────────────────────────────────────────────────────
// GET  /api/club-config
router.get('/', requireAuth, requireAdmin, getConfig);

// PATCH /api/club-config
router.patch('/', requireAuth, requireAdmin, updateConfig);

// GET  /api/club-config/ads
router.get('/ads', requireAuth, requireAdmin, getAds);

// POST /api/club-config/ads
router.post('/ads', requireAuth, requireAdmin, createAd);

// PATCH /api/club-config/ads/:id
router.patch('/ads/:id', requireAuth, requireAdmin, updateAd);

// DELETE /api/club-config/ads/:id
router.delete('/ads/:id', requireAuth, requireAdmin, deleteAd);

module.exports = router;
