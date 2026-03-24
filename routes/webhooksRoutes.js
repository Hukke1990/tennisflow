const express = require('express');
const router = express.Router();
const { mercadopago } = require('../controllers/webhooksController');

// POST /api/webhooks/mercadopago
// MP no envía auth token — la validación se hace con HMAC en el controller.
// No aplicar requireAuth aquí: MP llama sin sesión de usuario.
router.post('/mercadopago', mercadopago);

module.exports = router;
