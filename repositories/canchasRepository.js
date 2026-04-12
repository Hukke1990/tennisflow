/**
 * repositories/canchasRepository.js
 *
 * Acceso a datos de la tabla `canchas`.
 */

'use strict';

const supabase = require('../services/supabase');
const { CANCHA_FIELDS } = require('../config/constants');
const { NotFoundError, ConflictError, InternalError } = require('../utils/errors');

const CANCHA_SELECT = CANCHA_FIELDS.join(', ');

/**
 * Lista todas las canchas de un club, ordenadas por nombre.
 *
 * @param {string} clubId
 * @returns {Promise<object[]>}
 * @throws {InternalError}
 */
const findByClub = async (clubId) => {
  const { data, error } = await supabase
    .from('canchas')
    .select(CANCHA_SELECT)
    .eq('club_id', clubId)
    .order('nombre', { ascending: true });

  if (error) throw new InternalError(`Error al listar canchas: ${error.message}`);
  return data || [];
};

/**
 * Crea una cancha nueva.
 *
 * @param {string} clubId
 * @param {{ nombre: string, tipo_superficie: string, descripcion?: string|null, esta_disponible?: boolean }} payload
 * @returns {Promise<object>}
 * @throws {InternalError}
 */
const create = async (clubId, payload) => {
  const { data, error } = await supabase
    .from('canchas')
    .insert([{ ...payload, club_id: clubId }])
    .select(CANCHA_SELECT)
    .single();

  if (error) throw new InternalError(`Error al crear cancha: ${error.message}`);
  return data;
};

/**
 * Actualiza una cancha verificando que pertenezca al club.
 *
 * @param {string} canchaId
 * @param {string} clubId
 * @param {object} payload  - Campos parciales a actualizar
 * @returns {Promise<object>}
 * @throws {NotFoundError | InternalError}
 */
const update = async (canchaId, clubId, payload) => {
  const { data, error } = await supabase
    .from('canchas')
    .update(payload)
    .eq('id', canchaId)
    .eq('club_id', clubId)
    .select(CANCHA_SELECT)
    .single();

  if (error) {
    if (error.code === 'PGRST116') throw new NotFoundError('Cancha no encontrada.');
    throw new InternalError(`Error al actualizar cancha: ${error.message}`);
  }
  return data;
};

/**
 * Actualiza solo el estado de disponibilidad.
 *
 * @param {string} canchaId
 * @param {string} clubId
 * @param {boolean} estaDisponible
 * @returns {Promise<object>}
 * @throws {NotFoundError | InternalError}
 */
const updateEstado = async (canchaId, clubId, estaDisponible) => {
  const { data, error } = await supabase
    .from('canchas')
    .update({ esta_disponible: estaDisponible })
    .eq('id', canchaId)
    .eq('club_id', clubId)
    .select(CANCHA_SELECT);

  if (error || !data || data.length === 0) {
    throw new NotFoundError('Cancha no encontrada o error al actualizar');
  }
  return data[0];
};

/**
 * Verifica que una cancha exista para el club dado.
 *
 * @param {string} canchaId
 * @param {string} clubId
 * @returns {Promise<boolean>}
 */
const exists = async (canchaId, clubId) => {
  const { data } = await supabase
    .from('canchas')
    .select('id')
    .eq('id', canchaId)
    .eq('club_id', clubId)
    .single();
  return !!data;
};

/**
 * Elimina una cancha verificando que pertenezca al club.
 *
 * @param {string} canchaId
 * @param {string} clubId
 * @throws {NotFoundError | ConflictError | InternalError}
 */
const remove = async (canchaId, clubId) => {
  const found = await exists(canchaId, clubId);
  if (!found) throw new NotFoundError('Cancha no encontrada.');

  const { error } = await supabase
    .from('canchas')
    .delete()
    .eq('id', canchaId)
    .eq('club_id', clubId);

  if (error) {
    if (error.code === '23503') {
      throw new ConflictError(
        'No se puede eliminar la cancha porque esta asociada a torneos o partidos.',
      );
    }
    throw new InternalError(`Error al eliminar cancha: ${error.message}`);
  }
};

module.exports = { findByClub, create, update, updateEstado, exists, remove };
