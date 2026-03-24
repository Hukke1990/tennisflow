const express = require('express');
const router = express.Router();
const suscripcionesController = require('../controllers/suscripcionesController');
const { requireAuth, requireAdmin } = require('../middlewares/auth');

// GET /api/suscripciones/planes — público, lista de planes con precios
router.get('/planes', suscripcionesController.getPlanes);

// GET /api/suscripciones/cotizacion — público, cotización dólar oficial + precios en ARS
router.get('/cotizacion', suscripcionesController.getCotizacion);

// GET /api/suscripciones/estado — estado de la suscripción del club autenticado
router.get('/estado', requireAuth, requireAdmin, suscripcionesController.getEstado);

// POST /api/suscripciones/iniciar — crea el preapproval en MP y devuelve init_point
router.post('/iniciar', requireAuth, requireAdmin, suscripcionesController.iniciar);

// POST /api/suscripciones/cancelar — cancela la suscripción activa
router.post('/cancelar', requireAuth, requireAdmin, suscripcionesController.cancelar);

module.exports = router;
