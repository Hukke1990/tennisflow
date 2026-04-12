/**
 * services/canchasService.js
 *
 * Lógica de negocio para gestión de canchas.
 * ❌ No maneja req/res ni emite eventos Socket.io (eso va en el controller).
 */

'use strict';

const canchasRepo = require('../repositories/canchasRepository');
const { ValidationError } = require('../utils/errors');

// ─── Helpers ─────────────────────────────────────────────────────────────────

const isNonEmptyString = (v) => typeof v === 'string' && v.trim() !== '';

/**
 * Normaliza y valida el payload para crear o actualizar una cancha.
 *
 * @param {object} body
 * @param {{ partial: boolean }} [opts]
 * @returns {object} payload listo para la DB
 * @throws {ValidationError}
 */
const normalizeCanchaPayload = (body, { partial = false } = {}) => {
  const payload = {};

  if (!partial || body.nombre !== undefined) {
    if (!isNonEmptyString(body.nombre)) {
      throw new ValidationError('El campo nombre es obligatorio.');
    }
    payload.nombre = body.nombre.trim();
  }

  if (!partial || body.tipo_superficie !== undefined) {
    if (!isNonEmptyString(body.tipo_superficie)) {
      throw new ValidationError('El campo tipo_superficie es obligatorio.');
    }
    payload.tipo_superficie = body.tipo_superficie.trim();
  }

  if (body.descripcion !== undefined) {
    if (body.descripcion === null) {
      payload.descripcion = null;
    } else if (typeof body.descripcion === 'string') {
      payload.descripcion = body.descripcion.trim();
    } else {
      throw new ValidationError('El campo descripcion debe ser texto.');
    }
  }

  if (!partial || body.esta_disponible !== undefined) {
    if (body.esta_disponible === undefined) {
      payload.esta_disponible = true;
    } else if (typeof body.esta_disponible === 'boolean') {
      payload.esta_disponible = body.esta_disponible;
    } else {
      throw new ValidationError('El campo esta_disponible debe ser un booleano.');
    }
  }

  if (partial && Object.keys(payload).length === 0) {
    throw new ValidationError('No hay campos validos para actualizar.');
  }

  return payload;
};

// ─── API pública ─────────────────────────────────────────────────────────────

/**
 * Lista canchas de un club.
 * @param {string} clubId
 * @returns {Promise<object[]>}
 */
const listarCanchas = (clubId) =>
  canchasRepo.findByClub(clubId);

/**
 * Crea una cancha nueva.
 * @param {string} clubId
 * @param {object} body
 * @returns {Promise<object>}
 */
const crearCancha = (clubId, body) => {
  const payload = normalizeCanchaPayload(body, { partial: false });
  return canchasRepo.create(clubId, payload);
};

/**
 * Actualiza datos de una cancha.
 * @param {string} canchaId
 * @param {string} clubId
 * @param {object} body
 * @returns {Promise<object>}
 */
const actualizarCancha = (canchaId, clubId, body) => {
  const payload = normalizeCanchaPayload(body, { partial: true });
  return canchasRepo.update(canchaId, clubId, payload);
};

/**
 * Actualiza solo disponibilidad de una cancha.
 * @param {string} canchaId
 * @param {string} clubId
 * @param {boolean} estaDisponible
 * @returns {Promise<object>}
 */
const actualizarEstado = (canchaId, clubId, estaDisponible) => {
  if (typeof estaDisponible !== 'boolean') {
    throw new ValidationError('El campo esta_disponible debe ser un booleano');
  }
  return canchasRepo.updateEstado(canchaId, clubId, estaDisponible);
};

/**
 * Elimina una cancha.
 * @param {string} canchaId
 * @param {string} clubId
 * @returns {Promise<void>}
 */
const eliminarCancha = (canchaId, clubId) =>
  canchasRepo.remove(canchaId, clubId);

module.exports = { listarCanchas, crearCancha, actualizarCancha, actualizarEstado, eliminarCancha };
