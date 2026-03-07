const express = require('express');
const router = express.Router();
const { getDashboard } = require('../controllers/dashboardController');

// GET /api/dashboard?jugador_id=UUID  (jugador_id opcional)
router.get('/', getDashboard);

module.exports = router;
