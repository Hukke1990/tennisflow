/**
 * repositories/webhookRepository.js
 *
 * Acceso a datos de la tabla `log_pagos`.
 * Maneja auditoría e idempotencia de webhooks de MP.
 */

'use strict';

const supabase = require('../services/supabase');
const { InternalError } = require('../utils/errors');

/**
 * Busca un log por clave compuesta (resource_id, topic, action).
 *
 * @param {string} resourceId
 * @param {string} topic
 * @param {string} action
 * @returns {Promise<{id: string, processing_status: string}|null>}
 */
const findLog = async (resourceId, topic, action) => {
  const { data } = await supabase
    .from('log_pagos')
    .select('id, processing_status')
    .eq('mp_resource_id', resourceId)
    .eq('mp_topic',       topic)
    .eq('mp_action',      action)
    .maybeSingle();
  return data || null;
};

/**
 * Inserta un log nuevo con estado 'processing'.
 *
 * @param {object} entry - Campos del log
 * @returns {Promise<string|null>} id del log creado
 */
const createLog = async (entry) => {
  const { data, error } = await supabase
    .from('log_pagos')
    .insert({ ...entry, processing_status: 'processing' })
    .select('id')
    .single();
  if (error) return null;
  return data.id;
};

/**
 * Marca un log como 'success' con campos adicionales.
 *
 * @param {string} logId
 * @param {object} [extra]
 * @returns {Promise<void>}
 */
const markSuccess = async (logId, extra = {}) => {
  if (!logId) return;
  await supabase
    .from('log_pagos')
    .update({ processing_status: 'success', fail_reason: null, ...extra })
    .eq('id', logId);
};

/**
 * Marca un log como 'failed' con motivo.
 *
 * @param {string} logId
 * @param {string} failReason
 * @returns {Promise<void>}
 */
const markFailed = async (logId, failReason) => {
  if (!logId) return;
  await supabase
    .from('log_pagos')
    .update({
      processing_status: 'failed',
      fail_reason: String(failReason || 'unknown_error').slice(0, 500),
    })
    .eq('id', logId);
};

/**
 * Reset un log a 'processing' (para retries).
 *
 * @param {string} logId
 * @returns {Promise<void>}
 */
const resetToProcessing = async (logId) => {
  if (!logId) return;
  await supabase
    .from('log_pagos')
    .update({ processing_status: 'processing', fail_reason: null })
    .eq('id', logId);
};

/**
 * Lista logs fallidos para panel de repair.
 *
 * @param {string} [clubId]
 * @param {number} [limit]
 * @returns {Promise<object[]>}
 */
const findFailed = async (clubId, limit = 50) => {
  let query = supabase
    .from('log_pagos')
    .select('*')
    .eq('processing_status', 'failed')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (clubId) query = query.eq('club_id', clubId);

  const { data } = await query;
  return data || [];
};

/**
 * Obtiene un log por id.
 *
 * @param {string} logId
 * @returns {Promise<object|null>}
 */
const findById = async (logId) => {
  const { data } = await supabase
    .from('log_pagos')
    .select('*')
    .eq('id', logId)
    .maybeSingle();
  return data || null;
};

/**
 * Marca un log como 'retried'.
 *
 * @param {string} logId
 * @param {object} [extra]
 * @returns {Promise<void>}
 */
const markRetried = async (logId, extra = {}) => {
  if (!logId) return;
  await supabase
    .from('log_pagos')
    .update({ processing_status: 'retried', fail_reason: null, ...extra })
    .eq('id', logId);
};

module.exports = {
  findLog,
  createLog,
  markSuccess,
  markFailed,
  resetToProcessing,
  findFailed,
  findById,
  markRetried,
};
