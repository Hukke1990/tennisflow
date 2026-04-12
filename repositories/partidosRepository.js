/**
 * repositories/partidosRepository.js
 *
 * Acceso a datos de la tabla `partidos`.
 */

'use strict';

const supabase = require('../services/supabase');
const { NotFoundError, InternalError } = require('../utils/errors');

/**
 * Busca un partido por id.
 *
 * @param {string} partidoId
 * @param {string} [select]
 * @returns {Promise<object|null>}
 */
const findById = async (partidoId, select = '*') => {
  const { data } = await supabase
    .from('partidos')
    .select(select)
    .eq('id', partidoId)
    .maybeSingle();
  return data || null;
};

/**
 * Obtiene un partido o lanza NotFoundError.
 *
 * @param {string} partidoId
 * @param {string} [select]
 * @returns {Promise<object>}
 * @throws {NotFoundError}
 */
const getById = async (partidoId, select = '*') => {
  const data = await findById(partidoId, select);
  if (!data) throw new NotFoundError('Partido no encontrado');
  return data;
};

/**
 * Lista partidos de un torneo.
 *
 * @param {string} torneoId
 * @param {string} [select]
 * @returns {Promise<object[]>}
 */
const findByTorneo = async (torneoId, select = '*') => {
  const { data } = await supabase
    .from('partidos')
    .select(select)
    .eq('torneo_id', torneoId)
    .order('created_at', { ascending: true });
  return data || [];
};

/**
 * Partidos finalizados sin ELO aplicado (para repair).
 *
 * @param {string} [clubId] - filtrar por club (via torneo)
 * @returns {Promise<object[]>}
 */
const findPendienteElo = async (clubId) => {
  let query = supabase
    .from('partidos')
    .select('id, torneo_id, ganador_id, jugador1_id, jugador2_id, estado, ranking_impact_applied')
    .eq('estado', 'finalizado')
    .eq('ranking_impact_applied', false);

  if (clubId) {
    // Join vía torneo
    query = query.not('torneo_id', 'is', null);
  }

  const { data } = await query.order('created_at', { ascending: false }).limit(50);
  return data || [];
};

/**
 * Actualiza un partido.
 *
 * @param {string} partidoId
 * @param {object} campos
 * @returns {Promise<object>}
 * @throws {InternalError}
 */
const update = async (partidoId, campos) => {
  const { data, error } = await supabase
    .from('partidos')
    .update(campos)
    .eq('id', partidoId)
    .select()
    .single();

  if (error) throw new InternalError(error.message);
  return data;
};

/**
 * Cuenta partidos finalizados de un torneo.
 *
 * @param {string} torneoId
 * @returns {Promise<number>}
 */
const countFinalizados = async (torneoId) => {
  const { count } = await supabase
    .from('partidos')
    .select('id', { count: 'exact', head: true })
    .eq('torneo_id', torneoId)
    .eq('estado', 'finalizado');
  return count ?? 0;
};

module.exports = {
  findById,
  getById,
  findByTorneo,
  findPendienteElo,
  update,
  countFinalizados,
};
