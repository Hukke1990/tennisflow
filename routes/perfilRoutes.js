const express = require('express');
const router = express.Router();
const { obtenerPerfil, actualizarPerfil, contarJugadoresPorClub } = require('../controllers/perfilController');
const { requireAuth, requireAdmin, requireSelfOrRole } = require('../middlewares/auth');

// GET /api/perfil/count?club_id=xxx  → Cantidad de jugadores activos del club
router.get('/count', requireAuth, requireAdmin, contarJugadoresPorClub);

// GET /api/perfil/:id  → Obtener perfil de un jugador
router.get('/:id', obtenerPerfil);

// PUT /api/perfil/:id  → Actualizar perfil de un jugador
router.put('/:id', requireAuth, requireSelfOrRole({ paramName: 'id' }), actualizarPerfil);

module.exports = router;
