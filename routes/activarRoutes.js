const express = require('express');
const router  = express.Router();
const { getClubParaActivar, iniciarPago, verificarPago } = require('../controllers/activarController');

// Rutas públicas — sin autenticación (el cliente aún no tiene cuenta)
router.get('/:clubId',            getClubParaActivar);
router.post('/:clubId/pagar',     iniciarPago);
router.get('/:clubId/verificar',  verificarPago);

module.exports = router;
