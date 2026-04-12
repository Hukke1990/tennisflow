/**
 * utils/validators/perfilValidator.js
 *
 * Validaciones específicas para el dominio de perfiles.
 */

'use strict';

const { parseCategoria, requirePhone } = require('./commonValidators');

/**
 * Valida y normaliza el body de actualización de perfil.
 * Retorna solo los campos presentes y válidos.
 *
 * @param {object} body          - req.body
 * @param {boolean} isAdmin      - Si el caller tiene rol admin/super_admin
 * @returns {object}             - Campos normalizados para the UPDATE
 * @throws {ValidationError}
 */
const validatePerfilUpdate = (body, isAdmin) => {
  const { ForbiddenError } = require('../errors');
  const {
    nombre_completo, apellido, localidad, foto_url,
    mano_dominante, estilo_reves, altura, peso, telefono,
    categoria, categoria_singles, categoria_dobles,
  } = body;

  const wantsToEditCats = (
    categoria !== undefined || categoria_singles !== undefined || categoria_dobles !== undefined
  );
  if (wantsToEditCats && !isAdmin) {
    throw new ForbiddenError('Solo admin o super_admin pueden editar categorias.');
  }

  const campos = {};
  if (nombre_completo !== undefined) campos.nombre_completo = nombre_completo;
  if (apellido        !== undefined) campos.apellido        = apellido;
  if (localidad       !== undefined) campos.localidad       = localidad;
  if (foto_url        !== undefined) campos.foto_url        = foto_url;
  if (mano_dominante  !== undefined) campos.mano_dominante  = mano_dominante;
  if (estilo_reves    !== undefined) campos.estilo_reves    = estilo_reves;
  if (altura          !== undefined) campos.altura          = altura ? parseInt(altura, 10) : null;
  if (peso            !== undefined) campos.peso            = peso   ? parseInt(peso, 10)   : null;

  if (telefono !== undefined)        campos.telefono            = requirePhone(telefono);
  if (categoria !== undefined)       campos.categoria           = parseCategoria(categoria,         'categoria');
  if (categoria_singles !== undefined) campos.categoria_singles = parseCategoria(categoria_singles, 'categoria_singles');
  if (categoria_dobles  !== undefined) campos.categoria_dobles  = parseCategoria(categoria_dobles,  'categoria_dobles');

  // Compat: sincronizar campo legacy categoria si solo se edita categoria_singles
  if (isAdmin && categoria === undefined && categoria_singles !== undefined && campos.categoria_singles !== undefined) {
    campos.categoria = campos.categoria_singles;
  }

  return campos;
};

module.exports = { validatePerfilUpdate };
