/**
 * domain/eloCalculator.js
 *
 * Lógica pura de cálculo ELO para tenis de pádel/tenis.
 * ❌ Sin I/O  ❌ Sin Supabase  ❌ Sin req/res  ❌ Sin side effects
 *
 * Extraída de rpc_finalizar_partido_atomico y partidosController.
 */

'use strict';

const { ELO_K_FACTOR, ELO_BASE, ELO_INITIAL, ELO_MIN } = require('../config/constants');

/**
 * Calcula la probabilidad esperada de victoria del jugador A contra B.
 *
 * @param {number} eloA - ELO del jugador A
 * @param {number} eloB - ELO del jugador B
 * @returns {number} Probabilidad entre 0 y 1
 */
const expectedScore = (eloA, eloB) =>
  1 / (1 + Math.pow(10, (eloB - eloA) / ELO_BASE));

/**
 * Aplica la fórmula ELO estándar.
 *
 * @param {number} currentElo   - ELO actual del jugador
 * @param {number} score        - Resultado real: 1 (ganó) o 0 (perdió)
 * @param {number} expected     - Probabilidad esperada de victoria
 * @param {number} [k]          - Factor K (default: ELO_K_FACTOR)
 * @returns {number} Nuevo ELO (mínimo ELO_MIN)
 */
const newElo = (currentElo, score, expected, k = ELO_K_FACTOR) =>
  Math.max(ELO_MIN, Math.round(currentElo + k * (score - expected)));

// ─── Singles ──────────────────────────────────────────────────────────────────

/**
 * Calcula los nuevos ELO para un partido de singles.
 *
 * @param {number} winnerElo   - ELO actual del ganador
 * @param {number} loserElo    - ELO actual del perdedor
 * @returns {{ winnerNewElo: number, loserNewElo: number, delta: number }}
 */
const calculateSinglesElo = (winnerElo = ELO_INITIAL, loserElo = ELO_INITIAL) => {
  const exp = expectedScore(winnerElo, loserElo);
  const winnerNewElo = newElo(winnerElo, 1, exp);
  const loserNewElo  = newElo(loserElo,  0, 1 - exp);
  return {
    winnerNewElo,
    loserNewElo,
    delta: winnerNewElo - winnerElo,
  };
};

// ─── Dobles ───────────────────────────────────────────────────────────────────

/**
 * Calcula los nuevos ELO para un partido de dobles.
 * El ELO de equipo es el promedio de ambos integrantes.
 *
 * @param {object} params
 * @param {number} params.winnerElo        - ELO del ganador principal
 * @param {number} params.winnerPartnerElo - ELO del compañero del ganador
 * @param {number} params.loserElo         - ELO del perdedor
 * @param {number} params.loserPartnerElo  - ELO del compañero del perdedor
 * @returns {{ winnerNewElo: number, winnerPartnerNewElo: number, loserNewElo: number, loserPartnerNewElo: number, delta: number }}
 */
const calculateDoblesElo = ({
  winnerElo        = ELO_INITIAL,
  winnerPartnerElo = ELO_INITIAL,
  loserElo         = ELO_INITIAL,
  loserPartnerElo  = ELO_INITIAL,
}) => {
  const teamWinner = (winnerElo + winnerPartnerElo) / 2;
  const teamLoser  = (loserElo  + loserPartnerElo)  / 2;
  const exp        = expectedScore(teamWinner, teamLoser);

  return {
    winnerNewElo:        newElo(winnerElo,        1, exp),
    winnerPartnerNewElo: newElo(winnerPartnerElo,  1, exp),
    loserNewElo:         newElo(loserElo,          0, 1 - exp),
    loserPartnerNewElo:  newElo(loserPartnerElo,   0, 1 - exp),
    delta:               newElo(winnerElo, 1, exp) - winnerElo,
  };
};

/**
 * Mapea modalidad de torneo a campo de base de datos donde se guarda el ELO.
 *
 * @param {string} modalidad
 * @returns {'ranking_elo_singles' | 'ranking_elo_dobles' | 'ranking_elo_mixto'}
 */
const eloFieldForModalidad = (modalidad) => {
  if (['singles', 'singles_femenino'].includes(modalidad))        return 'ranking_elo_singles';
  if (['dobles', 'dobles_femenino'].includes(modalidad))          return 'ranking_elo_dobles';
  if (modalidad === 'mixto')                                       return 'ranking_elo_mixto';
  return 'ranking_elo_singles'; // default seguro
};

/**
 * Devuelve true si la modalidad usa ELO de dobles.
 * @param {string} modalidad
 */
const isModalidadDobles = (modalidad) =>
  ['dobles', 'dobles_femenino', 'mixto'].includes(modalidad);

module.exports = {
  expectedScore,
  newElo,
  calculateSinglesElo,
  calculateDoblesElo,
  eloFieldForModalidad,
  isModalidadDobles,
};
