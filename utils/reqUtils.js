/**
 * utils/reqUtils.js
 *
 * Helpers reutilizables para extraer y validar datos de la Request de Express.
 * Reemplaza las funciones resolveClubId* repetidas en cada controller.
 */

'use strict';

const { UUID_REGEX } = require('../config/constants');

/**
 * Extrae y valida club_id desde query o header x-club-id (obligatorio).
 *
 * @param {import('express').Request} req
 * @returns {{ clubId: string|null, error: string|null }}
 */
const resolveClubId = (req) => {
  const raw = req.query?.club_id ?? req.headers?.['x-club-id'];
  const clubId = String(raw || '').trim();

  if (!clubId)            return { clubId: null, error: 'club_id es obligatorio.' };
  if (!UUID_REGEX.test(clubId)) return { clubId: null, error: 'club_id debe ser un UUID valido.' };

  return { clubId, error: null };
};

/**
 * Extrae y valida club_id desde query o header x-club-id (opcional).
 * No retorna error si no viene — retorna clubId: null.
 *
 * @param {import('express').Request} req
 * @returns {{ clubId: string|null, error: string|null }}
 */
const resolveClubIdOptional = (req) => {
  const raw = req.query?.club_id ?? req.headers?.['x-club-id'];
  const clubId = String(raw || '').trim();

  if (!clubId)            return { clubId: null,  error: null };
  if (!UUID_REGEX.test(clubId)) return { clubId: null, error: 'club_id debe ser un UUID valido.' };

  return { clubId, error: null };
};

/**
 * Devuelve el request_id del header estándar.
 * @param {import('express').Request} req
 * @returns {string}
 */
const getRequestId = (req) =>
  req.requestId || req.headers['x-request-id'] || '';

module.exports = { resolveClubId, resolveClubIdOptional, getRequestId };
