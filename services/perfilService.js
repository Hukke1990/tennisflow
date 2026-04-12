/**
 * services/perfilService.js
 *
 * Lógica de negocio para perfiles de jugadores.
 * ❌ No maneja req/res — eso es responsabilidad del controller.
 *
 * @module PerfilService
 */

'use strict';

const perfilRepo = require('../repositories/perfilRepository');
const { ADMIN_ROLES, INTERNATIONAL_PHONE_REGEX, CATEGORIA_MIN, CATEGORIA_MAX } = require('../config/constants');
const { ValidationError, ForbiddenError } = require('../utils/errors');

// ─── Helpers de validación internos ──────────────────────────────────────────

/**
 * Normaliza el rol del usuario para comparaciones.
 * @param {unknown} value
 * @returns {string}
 */
const normalizeRole = (value) => {
  const s = String(value || '').trim().toLowerCase();
  if (s === 'superadmin' || s === 'super_admin') return 'super_admin';
  if (s === 'admin' || s === 'administrador')     return 'admin';
  if (s === 'jugador' || s === 'player')           return 'jugador';
  return '';
};

/**
 * Parsea y valida un campo de categoría (1-5).
 * @param {unknown} rawValue
 * @param {string} fieldName
 * @returns {number|null}
 * @throws {ValidationError}
 */
const parseCategoria = (rawValue, fieldName) => {
  if (rawValue === null || rawValue === undefined || rawValue === '') return null;

  const parsed = Number.parseInt(String(rawValue), 10);
  if (!Number.isInteger(parsed) || parsed < CATEGORIA_MIN || parsed > CATEGORIA_MAX) {
    throw new ValidationError(`${fieldName} debe ser un numero entre ${CATEGORIA_MIN} y ${CATEGORIA_MAX}.`);
  }
  return parsed;
};

/**
 * Normaliza y valida un número de teléfono.
 * @param {unknown} rawValue
 * @returns {string}
 * @throws {ValidationError}
 */
const normalizeTelefono = (rawValue) => {
  const value = String(rawValue ?? '').trim();
  if (!value) throw new ValidationError('telefono es obligatorio.');
  if (!INTERNATIONAL_PHONE_REGEX.test(value)) {
    throw new ValidationError('telefono debe tener formato internacional. Ejemplo: +5491122334455');
  }
  return value;
};

// ─── API pública ─────────────────────────────────────────────────────────────

/**
 * Obtiene el perfil público de un jugador.
 *
 * @param {string} perfilId
 * @param {string} clubId
 * @returns {Promise<object>}
 */
const getPerfil = (perfilId, clubId) =>
  perfilRepo.getById(perfilId, clubId);

/**
 * Actualiza el perfil de un jugador con validaciones de negocio.
 *
 * @param {string} perfilId      - UUID del perfil a editar
 * @param {object} body          - Campos recibidos (sin validar)
 * @param {object} authUser      - Usuario autenticado (de req.authUser)
 * @returns {Promise<object>}    - Perfil actualizado
 * @throws {ValidationError | ForbiddenError}
 */
const actualizarPerfil = async (perfilId, body, authUser) => {
  const {
    nombre_completo, apellido, localidad, foto_url,
    mano_dominante, estilo_reves, altura, peso, telefono,
    categoria, categoria_singles, categoria_dobles,
  } = body;

  const currentRole        = normalizeRole(authUser?.rol);
  const canEditCategorias  = ADMIN_ROLES.has(currentRole);
  const wantsToEditCats    = (categoria !== undefined || categoria_singles !== undefined || categoria_dobles !== undefined);

  if (wantsToEditCats && !canEditCategorias) {
    throw new ForbiddenError('Solo admin o super_admin pueden editar categorias.');
  }

  /** @type {Record<string, unknown>} */
  const campos = {};

  if (nombre_completo !== undefined) campos.nombre_completo = nombre_completo;
  if (apellido        !== undefined) campos.apellido        = apellido;
  if (localidad       !== undefined) campos.localidad       = localidad;
  if (foto_url        !== undefined) campos.foto_url        = foto_url;
  if (mano_dominante  !== undefined) campos.mano_dominante  = mano_dominante;
  if (estilo_reves    !== undefined) campos.estilo_reves    = estilo_reves;
  if (altura          !== undefined) campos.altura          = altura ? parseInt(altura, 10) : null;
  if (peso            !== undefined) campos.peso            = peso   ? parseInt(peso, 10)   : null;

  if (telefono !== undefined) {
    campos.telefono = normalizeTelefono(telefono);
  }

  if (categoria !== undefined) {
    campos.categoria = parseCategoria(categoria, 'categoria');
  }
  if (categoria_singles !== undefined) {
    campos.categoria_singles = parseCategoria(categoria_singles, 'categoria_singles');
  }
  if (categoria_dobles !== undefined) {
    campos.categoria_dobles = parseCategoria(categoria_dobles, 'categoria_dobles');
  }

  // Compat: sincronizar campo legacy categoria si se edita categoria_singles
  if (canEditCategorias && categoria === undefined && categoria_singles !== undefined && campos.categoria_singles !== undefined) {
    campos.categoria = campos.categoria_singles;
  }

  return perfilRepo.update(perfilId, campos);
};

/**
 * Cuenta jugadores de un club.
 *
 * @param {string} clubId
 * @returns {Promise<number>}
 */
const contarJugadores = (clubId) =>
  perfilRepo.countByClub(clubId);

module.exports = { getPerfil, actualizarPerfil, contarJugadores };
