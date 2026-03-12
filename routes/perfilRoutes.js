const express = require('express');
const router = express.Router();
const { obtenerPerfil, actualizarPerfil } = require('../controllers/perfilController');
const { requireAuth, requireSelfOrRole } = require('../middlewares/auth');

// GET /api/perfil/:id  → Obtener perfil de un jugador
router.get('/:id', obtenerPerfil);

// PUT /api/perfil/:id  → Actualizar perfil de un jugador
router.put('/:id', requireAuth, requireSelfOrRole({ paramName: 'id' }), actualizarPerfil);

module.exports = router;
