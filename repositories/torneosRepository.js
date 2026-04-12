/**
 * repositories/torneosRepository.js
 *
 * Acceso a datos de la tabla `torneos` e `inscripciones`.
 */

'use strict';

const supabase = require('../services/supabase');
const { NotFoundError, InternalError } = require('../utils/errors');

/**
 * Busca un torneo por id validando que pertenezca al club.
 *
 * @param {string} torneoId
 * @param {string} clubId
 * @param {string} [select]
 * @returns {Promise<object>}
 * @throws {NotFoundError}
 */
const getById = async (torneoId, clubId, select = '*') => {
  const { data, error } = await supabase
    .from('torneos')
    .select(select)
    .eq('id', torneoId)
    .eq('club_id', clubId)
    .single();

  if (error || !data) throw new NotFoundError('Torneo no encontrado');
  return data;
};

/**
 * Lista torneos de un club con filtros opcionales.
 *
 * @param {string} clubId
 * @param {{ estado?: string, limit?: number, order?: string }} [opts]
 * @returns {Promise<object[]>}
 */
const findByClub = async (clubId, opts = {}) => {
  let query = supabase
    .from('torneos')
    .select('*')
    .eq('club_id', clubId);

  if (opts.estado) query = query.eq('estado', opts.estado);
  query = query.order(opts.order || 'created_at', { ascending: false });
  if (opts.limit) query = query.limit(opts.limit);

  const { data } = await query;
  return data || [];
};

/**
 * Cuenta torneos en progreso o abiertos (para validar solapamiento de plan).
 *
 * @param {string} clubId
 * @returns {Promise<number>}
 */
const countActivos = async (clubId) => {
  const { count } = await supabase
    .from('torneos')
    .select('id', { count: 'exact', head: true })
    .eq('club_id', clubId)
    .in('estado', ['abierto', 'en_progreso', 'publicado']);
  return count ?? 0;
};

/**
 * Actualiza un torneo.
 *
 * @param {string} torneoId
 * @param {string} clubId
 * @param {object} campos
 * @returns {Promise<object>}
 * @throws {InternalError}
 */
const update = async (torneoId, clubId, campos) => {
  const { data, error } = await supabase
    .from('torneos')
    .update(campos)
    .eq('id', torneoId)
    .eq('club_id', clubId)
    .select()
    .single();

  if (error) throw new InternalError(error.message);
  return data;
};

/**
 * Inscripciones aprobadas de un torneo.
 *
 * @param {string} torneoId
 * @param {string} [select]
 * @returns {Promise<object[]>}
 */
const findInscripcionesAprobadas = async (torneoId, select = '*') => {
  const { data } = await supabase
    .from('inscripciones')
    .select(select)
    .eq('torneo_id', torneoId)
    .in('estado_inscripcion', ['aprobado', 'approved']);
  return data || [];
};

/**
 * Cuenta inscripciones aprobadas por torneo_id.
 * Compat: soporta estados legacy (aprobado / approved).
 *
 * @param {string} torneoId
 * @returns {Promise<number>}
 */
const countInscripciones = async (torneoId) => {
  const { count } = await supabase
    .from('inscripciones')
    .select('id', { count: 'exact', head: true })
    .eq('torneo_id', torneoId)
    .in('estado_inscripcion', ['aprobado', 'approved']);
  return count ?? 0;
};

module.exports = {
  getById,
  findByClub,
  countActivos,
  update,
  findInscripcionesAprobadas,
  countInscripciones,
};
