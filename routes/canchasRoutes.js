const express = require('express');

// Exportar como función para inyectar io
module.exports = (io) => {
  const router = express.Router();
  const canchasController = require('../controllers/canchasController')(io);

  // GET /api/canchas
  router.get('/', canchasController.obtenerCanchas);

  // PUT /api/canchas/:id/estado
  router.put('/:id/estado', canchasController.actualizarEstadoCancha);

  return router;
};
