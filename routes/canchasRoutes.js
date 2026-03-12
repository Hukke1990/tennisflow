const express = require('express');
const { requireAuth, requireAdmin } = require('../middlewares/auth');

// Exportar como función para inyectar io
module.exports = (io) => {
  const router = express.Router();
  const canchasController = require('../controllers/canchasController')(io);

  // GET /api/canchas
  router.get('/', canchasController.obtenerCanchas);

  // POST /api/canchas
  router.post('/', requireAuth, requireAdmin, canchasController.crearCancha);

  // PUT /api/canchas/:id/estado
  router.put('/:id/estado', requireAuth, requireAdmin, canchasController.actualizarEstadoCancha);

  // PUT /api/canchas/:id
  router.put('/:id', requireAuth, requireAdmin, canchasController.actualizarCancha);

  // DELETE /api/canchas/:id
  router.delete('/:id', requireAuth, requireAdmin, canchasController.eliminarCancha);

  return router;
};
