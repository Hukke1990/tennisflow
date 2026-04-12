/**
 * repositories/perfilRepository.js
 *
 * Acceso a datos de la tabla `perfiles`.
 * Toda query a Supabase relacionada con perfiles pasa por aquí.
 *
 * @module PerfilRepository
 */

'use strict';

const supabase = require('../services/supabase');
const { PERFIL_PUBLIC_FIELDS } = require('../config/constants');
const { NotFoundError, InternalError } = require('../utils/errors');

const PUBLIC_SELECT = PERFIL_PUBLIC_FIELDS.join(', ');

/**
 * Obtiene un perfil público por id y club_id.
 *
 * @param {string} perfilId
 * @param {string} clubId
 * @returns {Promise<object>}
 * @throws {NotFoundError}
 */
const getById = async (perfilId, clubId) => {
  const { data, error } = await supabase
    .from('perfiles')
    .select(PUBLIC_SELECT)
    .eq('id', perfilId)
    .eq('club_id', clubId)
    .single();

  if (error || !data) throw new NotFoundError('Perfil no encontrado');
  return data;
};

/**
 * Actualiza campos de un perfil y retorna el registro actualizado.
 *
 * @param {string} perfilId
 * @param {object} campos - Campos a actualizar (ya validados y normalizados)
 * @returns {Promise<object>}
 * @throws {InternalError}
 */
const update = async (perfilId, campos) => {
  const { data, error } = await supabase
    .from('perfiles')
    .update(campos)
    .eq('id', perfilId)
    .select(PUBLIC_SELECT)
    .single();

  if (error) throw new InternalError(error.message);
  return data;
};

/**
 * Cuenta jugadores activos de un club.
 *
 * @param {string} clubId
 * @returns {Promise<number>}
 * @throws {InternalError}
 */
const countByClub = async (clubId) => {
  const { count, error } = await supabase
    .from('perfiles')
    .select('id', { count: 'exact', head: true })
    .eq('club_id', clubId);

  if (error) throw new InternalError(error.message);
  return count ?? 0;
};

/**
 * Devuelve los ids de todos los admins/super_admins de un club.
 * Útil para excluirlos de rankings.
 *
 * @param {string} clubId
 * @returns {Promise<string[]>}
 */
const getAdminIds = async (clubId) => {
  // Capa de compat: rol puede ser boolean (true = admin) o string
  const { data } = await supabase
    .from('perfiles')
    .select('id, rol')
    .eq('club_id', clubId);

  if (!data) return [];

  return data
    .filter((p) => {
      const rol = p.rol;
      if (rol === true || rol === 'admin' || rol === 'super_admin' || rol === 'administrador') return true;
      return false;
    })
    .map((p) => p.id);
};

/**
 * Busca perfiles por lista de ids con campos específicos.
 *
 * @param {string[]} ids
 * @param {string} [select]
 * @returns {Promise<object[]>}
 */
const getByIds = async (ids, select = PUBLIC_SELECT) => {
  if (!ids || ids.length === 0) return [];
  const { data } = await supabase
    .from('perfiles')
    .select(select)
    .in('id', ids);
  return data || [];
};

/**
 * Obtiene perfil con todos los campos (para uso interno/admin).
 *
 * @param {string} perfilId
 * @param {string} clubId
 * @returns {Promise<object|null>}
 */
const getFullById = async (perfilId, clubId) => {
  const { data } = await supabase
    .from('perfiles')
    .select('*')
    .eq('id', perfilId)
    .eq('club_id', clubId)
    .maybeSingle();
  return data || null;
};

module.exports = {
  getById,
  update,
  countByClub,
  getAdminIds,
  getByIds,
  getFullById,
};
