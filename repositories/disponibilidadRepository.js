/**
 * repositories/disponibilidadRepository.js
 *
 * Acceso a datos de la tabla `disponibilidad_jugador`.
 */

'use strict';

const supabase = require('../services/supabase');
const { InternalError } = require('../utils/errors');

/**
 * Elimina toda la disponibilidad de un jugador.
 *
 * @param {string} jugadorId
 * @throws {InternalError}
 */
const deleteByJugador = async (jugadorId) => {
  const { error } = await supabase
    .from('disponibilidad_jugador')
    .delete()
    .eq('jugador_id', jugadorId);
  if (error) throw new InternalError(`Error al limpiar disponibilidad: ${error.message}`);
};

/**
 * Inserta múltiples registros de disponibilidad.
 *
 * @param {Array<{ jugador_id: string, dia_semana: number, hora_inicio: string, hora_fin: string }>} registros
 * @returns {Promise<object[]>}
 * @throws {InternalError}
 */
const insertMany = async (registros) => {
  const { data, error } = await supabase
    .from('disponibilidad_jugador')
    .insert(registros)
    .select();
  if (error) throw new InternalError(`Error al guardar disponibilidad: ${error.message}`);
  return data || [];
};

module.exports = { deleteByJugador, insertMany };
