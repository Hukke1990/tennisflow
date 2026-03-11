const express = require('express');
const router = express.Router();
const torneosController = require('../controllers/torneosController');
const partidosController = require('../controllers/partidosController');

const mapPartidoIdParam = (req, res, next) => {
	if (!req.params.id && req.params.partidoId) {
		req.params.id = req.params.partidoId;
	}
	next();
};

// GET /api/torneos
router.get('/', torneosController.obtenerTodosLosTorneos);

// GET /api/torneos/disponibles
router.get('/disponibles', torneosController.obtenerTorneosDisponibles);

// GET /api/torneos/admin
router.get('/admin', torneosController.obtenerTodosLosTorneos);

// POST /api/torneos
router.post('/', torneosController.crearTorneo);

// PUT /api/torneos/:id
router.put('/:id', torneosController.actualizarTorneoCompat);
router.patch('/:id', torneosController.actualizarTorneoCompat);

// POST /api/torneos/:torneoId/inscribir
router.post('/:torneoId/inscribir', torneosController.inscribirJugador);

// GET /api/torneos/:id/canchas
router.get('/:id/canchas', torneosController.obtenerCanchasDelTorneo);

// GET /api/torneos/:id/estado-canchas
router.get('/:id/estado-canchas', torneosController.obtenerEstadoCanchas);

// Alias frontend: /api/torneos/:id/canchas/estado
router.get('/:id/canchas/estado', torneosController.obtenerEstadoCanchas);

// PUT/PATCH /api/torneos/:id/estado
router.put('/:id/estado', torneosController.actualizarEstadoTorneo);
router.patch('/:id/estado', torneosController.actualizarEstadoTorneo);

// Compatibilidad frontend para control en vivo bajo /torneos/:torneoId/partidos/:partidoId
router.put('/:torneoId/partidos/:partidoId/empezar', mapPartidoIdParam, partidosController.empezarPartido);
router.patch('/:torneoId/partidos/:partidoId/empezar', mapPartidoIdParam, partidosController.empezarPartido);
router.put('/:torneoId/partidos/:partidoId/iniciar', mapPartidoIdParam, partidosController.empezarPartido);
router.patch('/:torneoId/partidos/:partidoId/iniciar', mapPartidoIdParam, partidosController.empezarPartido);

router.put('/:torneoId/partidos/:partidoId/marcador', mapPartidoIdParam, partidosController.actualizarMarcadorEnVivo);
router.patch('/:torneoId/partidos/:partidoId/marcador', mapPartidoIdParam, partidosController.actualizarMarcadorEnVivo);

router.put('/:torneoId/partidos/:partidoId/resultado', mapPartidoIdParam, partidosController.cargarResultado);
router.patch('/:torneoId/partidos/:partidoId/resultado', mapPartidoIdParam, partidosController.cargarResultado);

router.put('/:torneoId/partidos/:partidoId/estado', mapPartidoIdParam, partidosController.actualizarPartidoEnVivo);
router.patch('/:torneoId/partidos/:partidoId/estado', mapPartidoIdParam, partidosController.actualizarPartidoEnVivo);

router.put('/:torneoId/partidos/:partidoId/finalizar', mapPartidoIdParam, partidosController.cargarResultado);
router.patch('/:torneoId/partidos/:partidoId/finalizar', mapPartidoIdParam, partidosController.cargarResultado);

router.put('/:torneoId/partidos/:partidoId', mapPartidoIdParam, partidosController.actualizarPartidoEnVivo);
router.patch('/:torneoId/partidos/:partidoId', mapPartidoIdParam, partidosController.actualizarPartidoEnVivo);

// SORTEO Y CUADRO 
const sorteoController = require('../controllers/sorteoController');
// POST /api/torneos/:id/sorteo
router.post('/:id/sorteo', sorteoController.generarSorteo);
// POST /api/torneos/:id/cronograma
router.post('/:id/cronograma', sorteoController.recalcularCronograma);
// POST /api/torneos/:id/cronograma/publicar
router.post('/:id/cronograma/publicar', sorteoController.publicarCronograma);
// Alias legacy /api/torneos/:id/publicar-cronograma
router.post('/:id/publicar-cronograma', sorteoController.publicarCronograma);
// GET /api/torneos/:id/cuadro
router.get('/:id/cuadro', sorteoController.obtenerCuadroTorneo);

module.exports = router;
