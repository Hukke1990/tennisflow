const express = require('express');
const router = express.Router();
const partidosController = require('../controllers/partidosController');

// PUT /api/partidos/:id/resultado
router.put('/:id/resultado', partidosController.cargarResultado);

module.exports = router;
