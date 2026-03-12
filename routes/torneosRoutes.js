const express = require('express');
const router = express.Router();
const torneosController = require('../controllers/torneosController');
const partidosController = require('../controllers/partidosController');
const {
	requireAuth,
	requireAdmin,
	requireSelfOrRole,
	enforceJugadorIdForSelfOrAdmin,
} = require('../middlewares/auth');

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
router.get('/admin', requireAuth, requireAdmin, torneosController.obtenerTodosLosTorneos);

// GET /api/torneos/inscripciones/pendientes
router.get('/inscripciones/pendientes', requireAuth, requireAdmin, torneosController.obtenerInscripcionesPendientesAdmin);

// GET /api/torneos/inscripciones/whatsapp-template
router.get('/inscripciones/whatsapp-template', requireAuth, requireAdmin, torneosController.getInscripcionesWhatsappTemplate);

// PATCH /api/torneos/inscripciones/whatsapp-template
router.patch('/inscripciones/whatsapp-template', requireAuth, requireAdmin, torneosController.updateInscripcionesWhatsappTemplate);

// PATCH /api/torneos/inscripciones/:inscripcionId/estado
router.patch('/inscripciones/:inscripcionId/estado', requireAuth, requireAdmin, torneosController.validarInscripcionAdmin);

// GET /api/torneos/inscripciones/mis/:id
router.get('/inscripciones/mis/:id', requireAuth, requireSelfOrRole({ paramName: 'id' }), torneosController.obtenerInscripcionesPorJugador);

// POST /api/torneos
router.post('/', requireAuth, requireAdmin, torneosController.crearTorneo);

// PUT /api/torneos/:id
router.put('/:id', requireAuth, requireAdmin, torneosController.actualizarTorneoCompat);
router.patch('/:id', requireAuth, requireAdmin, torneosController.actualizarTorneoCompat);

// POST /api/torneos/:torneoId/inscribir
router.post('/:torneoId/inscribir', requireAuth, enforceJugadorIdForSelfOrAdmin(), torneosController.inscribirJugador);

// GET /api/torneos/:torneoId/companeros-disponibles
router.get('/:torneoId/companeros-disponibles', requireAuth, torneosController.listarCompanerosDoblesDisponibles);

// GET /api/torneos/:id/canchas
router.get('/:id/canchas', torneosController.obtenerCanchasDelTorneo);

// GET /api/torneos/:id/estado-canchas
router.get('/:id/estado-canchas', torneosController.obtenerEstadoCanchas);

// Alias frontend: /api/torneos/:id/canchas/estado
router.get('/:id/canchas/estado', torneosController.obtenerEstadoCanchas);

// PUT/PATCH /api/torneos/:id/estado
router.put('/:id/estado', requireAuth, requireAdmin, torneosController.actualizarEstadoTorneo);
router.patch('/:id/estado', requireAuth, requireAdmin, torneosController.actualizarEstadoTorneo);

// Compatibilidad frontend para control en vivo bajo /torneos/:torneoId/partidos/:partidoId
router.put('/:torneoId/partidos/:partidoId/empezar', requireAuth, requireAdmin, mapPartidoIdParam, partidosController.empezarPartido);
router.patch('/:torneoId/partidos/:partidoId/empezar', requireAuth, requireAdmin, mapPartidoIdParam, partidosController.empezarPartido);
router.put('/:torneoId/partidos/:partidoId/iniciar', requireAuth, requireAdmin, mapPartidoIdParam, partidosController.empezarPartido);
router.patch('/:torneoId/partidos/:partidoId/iniciar', requireAuth, requireAdmin, mapPartidoIdParam, partidosController.empezarPartido);

router.put('/:torneoId/partidos/:partidoId/marcador', requireAuth, requireAdmin, mapPartidoIdParam, partidosController.actualizarMarcadorEnVivo);
router.patch('/:torneoId/partidos/:partidoId/marcador', requireAuth, requireAdmin, mapPartidoIdParam, partidosController.actualizarMarcadorEnVivo);

router.put('/:torneoId/partidos/:partidoId/resultado', requireAuth, requireAdmin, mapPartidoIdParam, partidosController.cargarResultado);
router.patch('/:torneoId/partidos/:partidoId/resultado', requireAuth, requireAdmin, mapPartidoIdParam, partidosController.cargarResultado);

router.put('/:torneoId/partidos/:partidoId/estado', requireAuth, requireAdmin, mapPartidoIdParam, partidosController.actualizarPartidoEnVivo);
router.patch('/:torneoId/partidos/:partidoId/estado', requireAuth, requireAdmin, mapPartidoIdParam, partidosController.actualizarPartidoEnVivo);

router.put('/:torneoId/partidos/:partidoId/finalizar', requireAuth, requireAdmin, mapPartidoIdParam, partidosController.cargarResultado);
router.patch('/:torneoId/partidos/:partidoId/finalizar', requireAuth, requireAdmin, mapPartidoIdParam, partidosController.cargarResultado);

router.put('/:torneoId/partidos/:partidoId', requireAuth, requireAdmin, mapPartidoIdParam, partidosController.actualizarPartidoEnVivo);
router.patch('/:torneoId/partidos/:partidoId', requireAuth, requireAdmin, mapPartidoIdParam, partidosController.actualizarPartidoEnVivo);

// SORTEO Y CUADRO 
const sorteoController = require('../controllers/sorteoController');
// POST /api/torneos/:id/sorteo
router.post('/:id/sorteo', requireAuth, requireAdmin, sorteoController.generarSorteo);
// POST /api/torneos/:id/cronograma
router.post('/:id/cronograma', requireAuth, requireAdmin, sorteoController.recalcularCronograma);
// POST /api/torneos/:id/cronograma/publicar
router.post('/:id/cronograma/publicar', requireAuth, requireAdmin, sorteoController.publicarCronograma);
// Alias legacy /api/torneos/:id/publicar-cronograma
router.post('/:id/publicar-cronograma', requireAuth, requireAdmin, sorteoController.publicarCronograma);
// GET /api/torneos/:id/cuadro
router.get('/:id/cuadro', sorteoController.obtenerCuadroTorneo);

module.exports = router;
