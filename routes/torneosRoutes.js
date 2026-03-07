const express = require('express');
const router = express.Router();
const torneosController = require('../controllers/torneosController');

// GET /api/torneos/disponibles
router.get('/disponibles', torneosController.obtenerTorneosDisponibles);

// GET /api/torneos/admin
router.get('/admin', torneosController.obtenerTodosLosTorneos);

// POST /api/torneos
router.post('/', torneosController.crearTorneo);

// POST /api/torneos/:id/inscribir
router.post('/:id/inscribir', torneosController.inscribirJugador);

// SORTEO Y CUADRO 
const sorteoController = require('../controllers/sorteoController');
// POST /api/torneos/:id/sorteo
router.post('/:id/sorteo', sorteoController.generarSorteo);
// GET /api/torneos/:id/cuadro
router.get('/:id/cuadro', sorteoController.obtenerCuadroTorneo);

module.exports = router;
