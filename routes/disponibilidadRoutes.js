const express = require('express');
const router = express.Router();
const disponibilidadController = require('../controllers/disponibilidadController');

// POST /api/disponibilidad
router.post('/', disponibilidadController.guardarDisponibilidad);

module.exports = router;
