const express = require('express');
const router = express.Router();
const {
  crearClubConAdmin,
  listarClubes,
  activarClubManualmente,
  listarTorneos,
  editarTorneo,
  softDeleteTorneo,
  listarJugadores,
  editarJugador,
  listarRankings,
  ajustarPuntos,
  resetearPuntos,
} = require('../controllers/superAdminController');
const { requireAuth, requireRole } = require('../middlewares/auth');

// super_admin only (crear clubes)
const SA = [requireAuth, requireRole(['super_admin'])];
// admin o super_admin (panel de control del club)
const CA = [requireAuth, requireRole(['admin', 'super_admin'])];

router.post('/clubes', ...SA, crearClubConAdmin);
router.get('/clubes', ...SA, listarClubes);
router.patch('/clubes/:id/activar', ...SA, activarClubManualmente);

// Torneos
router.get('/torneos', ...CA, listarTorneos);
router.patch('/torneos/:id', ...CA, editarTorneo);
router.delete('/torneos/:id', ...CA, softDeleteTorneo);

// Jugadores
router.get('/jugadores', ...CA, listarJugadores);
router.patch('/jugadores/:id', ...CA, editarJugador);

// Rankings
router.get('/rankings', ...CA, listarRankings);
router.patch('/rankings/:id/puntos', ...CA, ajustarPuntos);
router.post('/rankings/resetear', ...CA, resetearPuntos);

module.exports = router;
