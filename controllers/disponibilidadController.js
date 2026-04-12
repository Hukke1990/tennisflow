/**
 * controllers/disponibilidadController.js
 *
 * Controller ultra-liviano: solo lee req, llama service, devuelve res.
 * Logica de negocio → services/disponibilidadService.js
 * Acceso a datos   → repositories/disponibilidadRepository.js
 */

'use strict';

const disponibilidadService = require('../services/disponibilidadService');
const { handleError }       = require('../utils/errors');
const logger                = require('../services/logger');

/**
 * POST /api/disponibilidad
 * Guarda (reemplaza) la disponibilidad semanal de un jugador.
 */
const guardarDisponibilidad = async (req, res) => {
  try {
    const { jugador_id, horarios } = req.body;
    const result = await disponibilidadService.guardarDisponibilidad(jugador_id, horarios);
    return res.json(result);
  } catch (err) {
    return handleError(res, err, logger);
  }
};

module.exports = { guardarDisponibilidad };
