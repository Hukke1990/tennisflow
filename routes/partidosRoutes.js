const express = require('express');
const router = express.Router();
const partidosController = require('../controllers/partidosController');
const { requireAuth, requireAdmin } = require('../middlewares/auth');

router.use(requireAuth, requireAdmin);

// PUT /api/partidos/:id/resultado
router.put('/:id/resultado', partidosController.cargarResultado);
router.patch('/:id/resultado', partidosController.cargarResultado);

// PUT /api/partidos/:id/finalizar
router.put('/:id/finalizar', partidosController.cargarResultado);
router.patch('/:id/finalizar', partidosController.cargarResultado);

// PUT /api/partidos/:id/estado
router.put('/:id/estado', partidosController.actualizarPartidoEnVivo);
router.patch('/:id/estado', partidosController.actualizarPartidoEnVivo);

// PUT /api/partidos/:id/empezar
router.put('/:id/empezar', partidosController.empezarPartido);
router.patch('/:id/empezar', partidosController.empezarPartido);

// Alias frontend: /api/partidos/:id/iniciar
router.put('/:id/iniciar', partidosController.empezarPartido);
router.patch('/:id/iniciar', partidosController.empezarPartido);

// PUT /api/partidos/:id/marcador
router.put('/:id/marcador', partidosController.actualizarMarcadorEnVivo);
router.patch('/:id/marcador', partidosController.actualizarMarcadorEnVivo);

// Compatibilidad frontend para reprogramacion de cronograma
router.put('/:id/reprogramar', partidosController.reprogramarPartido);
router.post('/:id/reprogramar', partidosController.reprogramarPartido);

router.put('/:id/programacion', partidosController.actualizarProgramacion);
router.post('/:id/programacion', partidosController.actualizarProgramacion);

router.put('/:id/horario', partidosController.actualizarHorario);
router.post('/:id/horario', partidosController.actualizarHorario);

// Endpoint generico para clientes legacy de control en vivo
router.put('/:id', partidosController.actualizarPartidoEnVivo);
router.patch('/:id', partidosController.actualizarPartidoEnVivo);

module.exports = router;
