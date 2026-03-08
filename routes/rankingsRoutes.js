const express = require('express');
const router = express.Router();

const rankingsController = require('../controllers/rankingsController');

// GET /api/rankings?modalidad=Singles|Dobles&sexo=Masculino|Femenino&categoria=1..5
router.get('/', rankingsController.getRankings);

module.exports = router;
