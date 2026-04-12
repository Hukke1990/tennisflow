/**
 * domain/torneoRules.js
 *
 * Reglas de dominio puras del ciclo de vida de un torneo.
 * ❌ Sin I/O  ❌ Sin Supabase  ❌ Sin req/res
 */

'use strict';

const { TORNEO_ESTADOS, TORNEO_MODALIDADES } = require('../config/constants');

// ─── Máquina de estados del torneo ───────────────────────────────────────────

/**
 * Mapa de transiciones permitidas: estado actual → estados destino válidos.
 * @type {Record<string, string[]>}
 */
const TRANSICIONES_VALIDAS = Object.freeze({
  borrador:     ['publicado', 'cancelado'],
  publicado:    ['abierto', 'borrador', 'cancelado'],
  abierto:      ['en_progreso', 'publicado', 'cancelado'],
  en_progreso:  ['finalizado', 'cancelado'],
  finalizado:   [],
  cancelado:    [],
});

/**
 * Verifica si una transición de estado es válida.
 *
 * @param {string} estadoActual  - Estado actual del torneo
 * @param {string} estadoNuevo   - Estado destino deseado
 * @returns {boolean}
 */
const isTransicionValida = (estadoActual, estadoNuevo) => {
  const destinos = TRANSICIONES_VALIDAS[estadoActual];
  return Array.isArray(destinos) && destinos.includes(estadoNuevo);
};

/**
 * Devuelve true si un torneo acepta inscripciones.
 * @param {{ estado: string, fecha_inicio_inscripcion?: string, fecha_fin_inscripcion?: string }} torneo
 */
const aceptaInscripciones = (torneo) => {
  if (torneo.estado !== 'abierto') return false;
  const now = new Date();
  if (torneo.fecha_inicio_inscripcion && new Date(torneo.fecha_inicio_inscripcion) > now) return false;
  if (torneo.fecha_fin_inscripcion    && new Date(torneo.fecha_fin_inscripcion)    < now) return false;
  return true;
};

/**
 * Devuelve true si modalidad es válida.
 * @param {string} modalidad
 */
const isModalidadValida = (modalidad) =>
  TORNEO_MODALIDADES.includes(String(modalidad || '').toLowerCase());

/**
 * Devuelve true si el estado es final (no puede cambiar más).
 * @param {string} estado
 */
const isEstadoFinal = (estado) =>
  estado === 'finalizado' || estado === 'cancelado';

// ─── Cuadro / Bracket ────────────────────────────────────────────────────────

/**
 * Devuelve la próxima potencia de 2 para un número de participantes.
 * Ej: 6 → 8, 9 → 16
 *
 * @param {number} n
 * @returns {number}
 */
const nextPowerOf2 = (n) => {
  if (n <= 0) return 1;
  let p = 1;
  while (p < n) p *= 2;
  return p;
};

/**
 * Calcula cuántos BYEs necesita un cuadro dado un número de participantes.
 *
 * @param {number} participantes
 * @returns {number}
 */
const calcularByes = (participantes) =>
  nextPowerOf2(participantes) - participantes;

/**
 * Devuelve los labels estándar de rondas para un cuadro de N slots.
 *
 * @param {number} totalSlots - Potencia de 2 (8, 16, 32, 64, 128)
 * @returns {string[]} Labels en orden: R128, R64, R32, R16, QF, SF, Final
 */
const getRondaLabels = (totalSlots) => {
  const LABELS = {
    128: 'R128',
    64:  'R64',
    32:  'R32',
    16:  'R16',
    8:   'QF',
    4:   'SF',
    2:   'Final',
  };
  const result = [];
  for (let slots = totalSlots; slots >= 2; slots /= 2) {
    result.push(LABELS[slots] || `R${slots}`);
  }
  return result;
};

module.exports = {
  TRANSICIONES_VALIDAS,
  isTransicionValida,
  aceptaInscripciones,
  isModalidadValida,
  isEstadoFinal,
  nextPowerOf2,
  calcularByes,
  getRondaLabels,
};
