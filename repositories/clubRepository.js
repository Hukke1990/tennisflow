/**
 * repositories/clubRepository.js
 *
 * Acceso a datos de la tabla `clubes`.
 */

'use strict';

const supabase = require('../services/supabase');
const { NotFoundError, InternalError } = require('../utils/errors');

/**
 * Busca un club por id.
 *
 * @param {string} clubId
 * @param {string} [select] - Columnas a seleccionar
 * @returns {Promise<object|null>}
 */
const findById = async (clubId, select = '*') => {
  const { data } = await supabase
    .from('clubes')
    .select(select)
    .eq('id', clubId)
    .maybeSingle();
  return data || null;
};

/**
 * Obtiene un club o lanza NotFoundError.
 *
 * @param {string} clubId
 * @param {string} [select]
 * @returns {Promise<object>}
 * @throws {NotFoundError}
 */
const getById = async (clubId, select = '*') => {
  const data = await findById(clubId, select);
  if (!data) throw new NotFoundError('Club no encontrado');
  return data;
};

/**
 * Actualiza campos de un club.
 *
 * @param {string} clubId
 * @param {object} campos
 * @returns {Promise<object>}
 * @throws {InternalError}
 */
const update = async (clubId, campos) => {
  const { data, error } = await supabase
    .from('clubes')
    .update(campos)
    .eq('id', clubId)
    .select()
    .single();

  if (error) throw new InternalError(error.message);
  return data;
};

/**
 * Activa un club (is_active = true).
 *
 * @param {string} clubId
 * @returns {Promise<void>}
 */
const activate = async (clubId) => {
  const { error } = await supabase
    .from('clubes')
    .update({ is_active: true })
    .eq('id', clubId);
  if (error) throw new InternalError(error.message);
};

/**
 * Actualiza el plan de un club.
 *
 * @param {string} clubId
 * @param {string} plan
 * @param {boolean} [isActive]
 * @returns {Promise<void>}
 */
const updatePlan = async (clubId, plan, isActive) => {
  const campos = { plan, updated_at: new Date().toISOString() };
  if (isActive !== undefined) campos.is_active = isActive;

  const { error } = await supabase
    .from('clubes')
    .update(campos)
    .eq('id', clubId);
  if (error) throw new InternalError(error.message);
};

module.exports = { findById, getById, update, activate, updatePlan };
