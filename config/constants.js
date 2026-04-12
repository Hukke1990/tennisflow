/**
 * config/constants.js
 *
 * Constantes de dominio compartidas en todo el backend.
 * Centraliza valores "mágicos" que antes estaban duplicados en controllers.
 */

'use strict';

// ─── Roles ────────────────────────────────────────────────────────────────────
const ROLES = Object.freeze({
  SUPER_ADMIN: 'super_admin',
  ADMIN:       'admin',
  JUGADOR:     'jugador',
});

const ADMIN_ROLES = Object.freeze(new Set([ROLES.ADMIN, ROLES.SUPER_ADMIN]));

// ─── Validación ───────────────────────────────────────────────────────────────
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INTERNATIONAL_PHONE_REGEX = /^\+[1-9]\d{7,14}$/;

// ─── Categorías ───────────────────────────────────────────────────────────────
const CATEGORIA_MIN = 1;
const CATEGORIA_MAX = 5;

// ─── Torneos ──────────────────────────────────────────────────────────────────
const TORNEO_ESTADOS = Object.freeze([
  'borrador',
  'publicado',
  'abierto',
  'en_progreso',
  'finalizado',
  'cancelado',
]);

const TORNEO_MODALIDADES = Object.freeze([
  'singles',
  'singles_femenino',
  'dobles',
  'dobles_femenino',
  'mixto',
]);

// ─── Planes ───────────────────────────────────────────────────────────────────
const PLAN_NAMES = Object.freeze(['basico', 'pro', 'premium', 'test']);

// ─── Suscripciones ────────────────────────────────────────────────────────────
const SUSCRIPCION_ESTADOS = Object.freeze(['authorized', 'paused', 'cancelled', 'pending']);

// ─── Canchas ──────────────────────────────────────────────────────────────────
const CANCHA_FIELDS = Object.freeze(['id', 'nombre', 'tipo_superficie', 'esta_disponible', 'descripcion']);

// ─── Perfiles ─────────────────────────────────────────────────────────────────
const PERFIL_PUBLIC_FIELDS = Object.freeze([
  'id', 'nombre_completo', 'apellido', 'foto_url',
  'ranking_elo_singles', 'ranking_elo_dobles',
  'categoria', 'categoria_singles', 'categoria_dobles',
  'sexo', 'mano_dominante', 'estilo_reves',
  'altura', 'peso', 'localidad', 'club_id',
]);

// ─── ELO ──────────────────────────────────────────────────────────────────────
const ELO_K_FACTOR    = 32;
const ELO_BASE        = 400;
const ELO_INITIAL     = 1000;
const ELO_MIN         = 100;

module.exports = {
  ROLES,
  ADMIN_ROLES,
  UUID_REGEX,
  INTERNATIONAL_PHONE_REGEX,
  CATEGORIA_MIN,
  CATEGORIA_MAX,
  TORNEO_ESTADOS,
  TORNEO_MODALIDADES,
  PLAN_NAMES,
  SUSCRIPCION_ESTADOS,
  CANCHA_FIELDS,
  PERFIL_PUBLIC_FIELDS,
  ELO_K_FACTOR,
  ELO_BASE,
  ELO_INITIAL,
  ELO_MIN,
};
