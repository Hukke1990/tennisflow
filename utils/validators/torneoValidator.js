/**
 * utils/validators/torneoValidator.js
 *
 * Validaciones específicas para el dominio de torneos.
 */

'use strict';

const { ValidationError } = require('../errors');
const { TORNEO_ESTADOS, TORNEO_MODALIDADES } = require('../../config/constants');
const { isTransicionValida } = require('../../domain/torneoRules');

/**
 * Valida que un estado de torneo sea reconocido.
 * @param {string} estado
 * @throws {ValidationError}
 */
const requireEstadoValido = (estado) => {
  if (!TORNEO_ESTADOS.includes(estado)) {
    throw new ValidationError(
      `Estado '${estado}' no es valido. Debe ser uno de: ${TORNEO_ESTADOS.join(', ')}`,
    );
  }
};

/**
 * Valida que una transición de estado sea permitida.
 * @param {string} estadoActual
 * @param {string} estadoNuevo
 * @throws {ValidationError}
 */
const requireTransicionValida = (estadoActual, estadoNuevo) => {
  if (!isTransicionValida(estadoActual, estadoNuevo)) {
    throw new ValidationError(
      `No se puede cambiar el torneo de '${estadoActual}' a '${estadoNuevo}'.`,
    );
  }
};

/**
 * Valida modalidad de torneo.
 * @param {string} modalidad
 * @throws {ValidationError}
 */
const requireModalidadValida = (modalidad) => {
  if (!TORNEO_MODALIDADES.includes(String(modalidad || '').toLowerCase())) {
    throw new ValidationError(
      `Modalidad '${modalidad}' no es valida. Debe ser una de: ${TORNEO_MODALIDADES.join(', ')}`,
    );
  }
};

/**
 * Valida el payload de creación de torneo.
 * Retorna los campos normalizados.
 *
 * @param {object} body
 * @returns {{ nombre: string, modalidad: string, formato: string, [key: string]: unknown }}
 * @throws {ValidationError}
 */
const validateCrearTorneo = (body) => {
  const { nombre, modalidad, formato } = body;

  if (!nombre || !String(nombre).trim()) {
    throw new ValidationError('El nombre del torneo es obligatorio.');
  }
  if (!modalidad) {
    throw new ValidationError('La modalidad del torneo es obligatoria.');
  }
  requireModalidadValida(modalidad);

  return {
    ...body,
    nombre:    String(nombre).trim(),
    modalidad: String(modalidad).toLowerCase(),
  };
};

module.exports = {
  requireEstadoValido,
  requireTransicionValida,
  requireModalidadValida,
  validateCrearTorneo,
};
