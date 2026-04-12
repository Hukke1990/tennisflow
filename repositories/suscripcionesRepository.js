/**
 * repositories/suscripcionesRepository.js
 *
 * Acceso a datos de la tabla `suscripciones`.
 */

'use strict';

const supabase = require('../services/supabase');
const { InternalError } = require('../utils/errors');

/**
 * Obtiene el estado de suscripción de un club.
 *
 * @param {string} clubId
 * @returns {Promise<object|null>}
 */
const findByClub = async (clubId) => {
  const { data } = await supabase
    .from('suscripciones')
    .select('*')
    .eq('club_id', clubId)
    .maybeSingle();
  return data || null;
};

/**
 * Busca suscripción por preapproval_id de MP.
 *
 * @param {string} preapprovalId
 * @param {string} [select]
 * @returns {Promise<object|null>}
 */
const findByPreapproval = async (preapprovalId, select = 'id, plan_id, pending_plan_id, club_id, status') => {
  const { data } = await supabase
    .from('suscripciones')
    .select(select)
    .eq('preapproval_id', preapprovalId)
    .maybeSingle();
  return data || null;
};

/**
 * Upsert de suscripción por club_id.
 *
 * @param {object} payload
 * @returns {Promise<object>}
 * @throws {InternalError}
 */
const upsert = async (payload) => {
  const { data, error } = await supabase
    .from('suscripciones')
    .upsert(payload, { onConflict: 'club_id' })
    .select()
    .single();

  if (error) throw new InternalError(error.message);
  return data;
};

/**
 * Actualiza suscripción por club_id.
 *
 * @param {string} clubId
 * @param {object} campos
 * @returns {Promise<void>}
 * @throws {InternalError}
 */
const updateByClub = async (clubId, campos) => {
  const { error } = await supabase
    .from('suscripciones')
    .update(campos)
    .eq('club_id', clubId);
  if (error) throw new InternalError(error.message);
};

/**
 * Cancela la suscripción de un club (deferred downgrade a 'basico').
 *
 * @param {string} clubId
 * @returns {Promise<void>}
 */
const cancelarSuscripcion = async (clubId) => {
  await updateByClub(clubId, {
    status:          'cancelled',
    pending_plan_id: 'basico',
  });
};

module.exports = {
  findByClub,
  findByPreapproval,
  upsert,
  updateByClub,
  cancelarSuscripcion,
};
