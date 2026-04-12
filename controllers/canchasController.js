/**
 * controllers/canchasController.js
 *
 * Controller ultra-liviano: solo lee req, llama service, emite Socket.io, devuelve res.
 * Logica de negocio y validaciones → services/canchasService.js
 * Acceso a datos → repositories/canchasRepository.js
 */

'use strict';

const canchasService    = require('../services/canchasService');
const { handleError }   = require('../utils/errors');
const { resolveClubId } = require('../utils/reqUtils');
const logger            = require('../services/logger');

// Exportar funcion constructora que recibe la instancia de Socket.io
module.exports = (io) => {
  /** Emite un evento de Socket.io si io esta disponible */
  const emit = (event, payload) => {
    if (io) io.emit(event, payload);
  };

  /**
   * GET /api/canchas?club_id=...
   * Lista canchas del club ordenadas por nombre.
   */
  const obtenerCanchas = async (req, res) => {
    try {
      const { clubId, error: clubError } = resolveClubId(req);
      if (clubError) return res.status(400).json({ error: clubError });

      const data = await canchasService.listarCanchas(clubId);
      return res.json(data);
    } catch (err) {
      return handleError(res, err, logger);
    }
  };

  /**
   * POST /api/canchas
   * Crea una cancha nueva.
   */
  const crearCancha = async (req, res) => {
    try {
      const { clubId, error: clubError } = resolveClubId(req);
      if (clubError) return res.status(400).json({ error: clubError });

      const cancha = await canchasService.crearCancha(clubId, req.body);
      return res.status(201).json({ message: 'Cancha creada correctamente.', cancha });
    } catch (err) {
      return handleError(res, err, logger);
    }
  };

  /**
   * PUT /api/canchas/:id
   * Actualiza datos de una cancha.
   */
  const actualizarCancha = async (req, res) => {
    try {
      const { id } = req.params;
      const { clubId, error: clubError } = resolveClubId(req);
      if (clubError) return res.status(400).json({ error: clubError });

      const cancha = await canchasService.actualizarCancha(id, clubId, req.body);
      emit('cancha_actualizada', cancha);
      return res.json({ message: 'Cancha actualizada correctamente.', cancha });
    } catch (err) {
      return handleError(res, err, logger);
    }
  };

  /**
   * DELETE /api/canchas/:id
   * Elimina una cancha (falla si tiene torneos/partidos asociados).
   */
  const eliminarCancha = async (req, res) => {
    try {
      const { id } = req.params;
      const { clubId, error: clubError } = resolveClubId(req);
      if (clubError) return res.status(400).json({ error: clubError });

      await canchasService.eliminarCancha(id, clubId);
      emit('cancha_eliminada', { id });
      return res.json({ message: 'Cancha eliminada correctamente.' });
    } catch (err) {
      return handleError(res, err, logger);
    }
  };

  /**
   * PUT /api/canchas/:id/estado
   * Actualiza solo el estado de disponibilidad de una cancha.
   */
  const actualizarEstadoCancha = async (req, res) => {
    try {
      const { id } = req.params;
      const { clubId, error: clubError } = resolveClubId(req);
      if (clubError) return res.status(400).json({ error: clubError });

      const cancha = await canchasService.actualizarEstado(id, clubId, req.body.esta_disponible);
      emit('estado_cancha_cambiado', cancha);
      return res.json({ message: 'Estado de la cancha actualizado', cancha });
    } catch (err) {
      return handleError(res, err, logger);
    }
  };

  return {
    obtenerCanchas,
    crearCancha,
    actualizarCancha,
    eliminarCancha,
    actualizarEstadoCancha,
  };
};
