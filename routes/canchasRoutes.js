const express = require('express');

// Exportar como función para inyectar io
module.exports = (io) => {
  const router = express.Router();
  const canchasController = require('../controllers/canchasController')(io);

  // GET /api/canchas
  router.get('/', canchasController.obtenerCanchas);

  // POST /api/canchas
  router.post('/', canchasController.crearCancha);

  // PUT /api/canchas/:id/estado
  router.put('/:id/estado', canchasController.actualizarEstadoCancha);

  // PUT /api/canchas/:id
  router.put('/:id', canchasController.actualizarCancha);

  // DELETE /api/canchas/:id
  router.delete('/:id', canchasController.eliminarCancha);

  return router;
};
