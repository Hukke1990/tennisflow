/**
 * utils/validators/commonValidators.js
 *
 * Validadores compartidos entre múltiples dominios.
 * Retornan el valor normalizado o lanzan ValidationError.
 */

'use strict';

const { ValidationError } = require('../errors');
const { UUID_REGEX, INTERNATIONAL_PHONE_REGEX, CATEGORIA_MIN, CATEGORIA_MAX } = require('../../config/constants');

/**
 * Valida y normaliza un UUID.
 * @param {unknown} value
 * @param {string} [fieldName]
 * @returns {string}
 * @throws {ValidationError}
 */
const requireUUID = (value, fieldName = 'id') => {
  const s = String(value || '').trim();
  if (!s)                   throw new ValidationError(`${fieldName} es obligatorio.`);
  if (!UUID_REGEX.test(s))  throw new ValidationError(`${fieldName} debe ser un UUID valido.`);
  return s;
};

/**
 * Valida un UUID (opcional — null/undefined retorna null sin error).
 * @param {unknown} value
 * @param {string} [fieldName]
 * @returns {string|null}
 * @throws {ValidationError}
 */
const optionalUUID = (value, fieldName = 'id') => {
  if (value === null || value === undefined || value === '') return null;
  return requireUUID(value, fieldName);
};

/**
 * Valida que un string no esté vacío.
 * @param {unknown} value
 * @param {string} fieldName
 * @returns {string}
 * @throws {ValidationError}
 */
const requireString = (value, fieldName) => {
  const s = String(value ?? '').trim();
  if (!s) throw new ValidationError(`${fieldName} es obligatorio.`);
  return s;
};

/**
 * Valida un teléfono en formato internacional.
 * @param {unknown} value
 * @returns {string}
 * @throws {ValidationError}
 */
const requirePhone = (value) => {
  const s = String(value ?? '').trim();
  if (!s) throw new ValidationError('telefono es obligatorio.');
  if (!INTERNATIONAL_PHONE_REGEX.test(s)) {
    throw new ValidationError('telefono debe tener formato internacional. Ejemplo: +5491122334455');
  }
  return s;
};

/**
 * Valida una categoría de jugador (1-5).
 * @param {unknown} value
 * @param {string} fieldName
 * @returns {number|null}
 * @throws {ValidationError}
 */
const parseCategoria = (value, fieldName = 'categoria') => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number.parseInt(String(value), 10);
  if (!Number.isInteger(n) || n < CATEGORIA_MIN || n > CATEGORIA_MAX) {
    throw new ValidationError(`${fieldName} debe ser un numero entre ${CATEGORIA_MIN} y ${CATEGORIA_MAX}.`);
  }
  return n;
};

/**
 * Valida que un valor sea booleano.
 * @param {unknown} value
 * @param {string} fieldName
 * @returns {boolean}
 * @throws {ValidationError}
 */
const requireBoolean = (value, fieldName) => {
  if (typeof value !== 'boolean') {
    throw new ValidationError(`${fieldName} debe ser un booleano (true/false).`);
  }
  return value;
};

/**
 * Valida que un valor sea un entero positivo.
 * @param {unknown} value
 * @param {string} fieldName
 * @returns {number|null}
 * @throws {ValidationError}
 */
const parsePositiveInt = (value, fieldName) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number.parseInt(String(value), 10);
  if (Number.isNaN(n) || n <= 0) {
    throw new ValidationError(`${fieldName} debe ser un numero entero positivo.`);
  }
  return n;
};

module.exports = {
  requireUUID,
  optionalUUID,
  requireString,
  requirePhone,
  parseCategoria,
  requireBoolean,
  parsePositiveInt,
};
