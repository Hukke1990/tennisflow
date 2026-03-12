const express = require('express');
const router = express.Router();
const disponibilidadController = require('../controllers/disponibilidadController');
const { requireAuth, enforceJugadorIdForSelfOrAdmin } = require('../middlewares/auth');

// POST /api/disponibilidad
router.post('/', requireAuth, enforceJugadorIdForSelfOrAdmin(), disponibilidadController.guardarDisponibilidad);

module.exports = router;
