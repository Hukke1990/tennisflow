const express = require('express');
const router = express.Router();
const {
  crearClubConAdmin,
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

const SA = [requireAuth, requireRole(['super_admin'])];

router.post('/clubes', ...SA, crearClubConAdmin);

// Torneos
router.get('/torneos', ...SA, listarTorneos);
router.patch('/torneos/:id', ...SA, editarTorneo);
router.delete('/torneos/:id', ...SA, softDeleteTorneo);

// Jugadores
router.get('/jugadores', ...SA, listarJugadores);
router.patch('/jugadores/:id', ...SA, editarJugador);

// Rankings
router.get('/rankings', ...SA, listarRankings);
router.patch('/rankings/:id/puntos', ...SA, ajustarPuntos);
router.post('/rankings/resetear', ...SA, resetearPuntos);

module.exports = router;
