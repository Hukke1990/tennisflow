const express = require('express');
const router  = express.Router();
const { getClubParaActivar, iniciarPago } = require('../controllers/activarController');

// Rutas públicas — sin autenticación (el cliente aún no tiene cuenta)
router.get('/:clubId',          getClubParaActivar);
router.post('/:clubId/pagar',   iniciarPago);

module.exports = router;
