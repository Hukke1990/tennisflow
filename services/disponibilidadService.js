/**
 * services/disponibilidadService.js
 *
 * Lógica de negocio para disponibilidad horaria de jugadores.
 * ❌ No maneja req/res
 */

'use strict';

const dispRepo = require('../repositories/disponibilidadRepository');
const { ValidationError } = require('../utils/errors');

/**
 * Guarda (reemplaza) la disponibilidad horaria de un jugador.
 * Primero borra la anterior, luego inserta los nuevos horarios.
 *
 * @param {string} jugadorId
 * @param {Array<{ dia_semana: number, hora_inicio: string, hora_fin: string }>} horarios
 * @returns {Promise<{ message: string, data?: object[] }>}
 * @throws {ValidationError}
 */
const guardarDisponibilidad = async (jugadorId, horarios) => {
  if (!jugadorId)                 throw new ValidationError('jugador_id es obligatorio');
  if (!Array.isArray(horarios))   throw new ValidationError('horarios debe ser un arreglo');

  await dispRepo.deleteByJugador(jugadorId);

  if (horarios.length === 0) {
    return { message: 'Disponibilidad borrada exitosamente (sin nuevos horarios)' };
  }

  const registros = horarios.map((h) => ({
    jugador_id:  jugadorId,
    dia_semana:  h.dia_semana,
    hora_inicio: h.hora_inicio,
    hora_fin:    h.hora_fin,
  }));

  const data = await dispRepo.insertMany(registros);
  return { message: 'Disponibilidad guardada exitosamente', data };
};

module.exports = { guardarDisponibilidad };
