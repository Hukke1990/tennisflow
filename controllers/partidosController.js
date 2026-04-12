'use strict';

const partidosService    = require('../services/partidosService');
const { handleError }    = require('../utils/errors');
const logger             = require('../services/logger');
const { incrementUsage }    = require('../utils/usageTracker');
const { trackEvent }        = require('../utils/analytics');
const { incrementCounter }  = require('../utils/analyticsCounters');
const { getClubPlan, getPlanLimits } = require('../utils/planResolver');
const { getUsage }              = require('../utils/usageTracker');
const { getPlanPressure, pressureToPct } = require('../services/planRecommendationService');

const cargarResultado = async (req, res) => {
  try {
    const clubId = req.authUser?.club_id;
    const data = await partidosService.cargarResultado({
      partidoId:     req.params.id,
      body:          req.body,
      callingClubId: clubId,
    });

    // Tracking de uso mensual + analytics (fire-and-forget)
    if (clubId) {
      incrementUsage(clubId, 'partidos_mes').catch(() => {});
      trackEvent('partido_jugado', { club_id: clubId, partido_id: req.params.id }).catch(() => {});
      incrementCounter(clubId, 'partidos').catch(() => {});

      // FASE 7 — Upgrade opportunity: si el uso mensual supera el 80% (fire-and-forget)
      ;(async () => {
        try {
          const [plan, currentPartidos] = await Promise.all([
            getClubPlan(clubId),
            getUsage(clubId, 'partidos_mes'),
          ]);
          const limits   = getPlanLimits(plan);
          const pressure = getPlanPressure({ usage: { torneos: 0, canchas: null, jugadores_activos: null, partidos: currentPartidos }, limits });
          const pct      = pressureToPct(pressure);
          if (pct >= 80) {
            trackEvent('upgrade_opportunity', { club_id: clubId, metric: 'partidos_mes', plan, pressure_pct: pct }).catch(() => {});
          }
        } catch (_) { /* no-op */ }
      })();
    }

    return res.status(200).json(data);
  } catch (err) {
    return handleError(res, err, logger);
  }
};

const actualizarProgramacion = async (req, res) => {
  try {
    const data = await partidosService.actualizarProgramacion({
      partidoId: req.params.id,
      body:      req.body,
    });
    return res.status(200).json(data);
  } catch (err) {
    return handleError(res, err, logger);
  }
};

const empezarPartido = async (req, res) => {
  try {
    const data = await partidosService.empezarPartido({
      partidoId: req.params.id,
    });
    return res.status(200).json(data);
  } catch (err) {
    return handleError(res, err, logger);
  }
};

const actualizarMarcadorEnVivo = async (req, res) => {
  try {
    const data = await partidosService.actualizarMarcadorEnVivo({
      partidoId: req.params.id,
      body:      req.body,
    });
    return res.status(200).json(data);
  } catch (err) {
    return handleError(res, err, logger);
  }
};

const actualizarPartidoEnVivo = async (req, res) => {
  try {
    const data = await partidosService.actualizarPartidoEnVivo({
      partidoId:     req.params.id,
      body:          req.body,
      callingClubId: req.authUser?.club_id,
    });
    return res.status(200).json(data);
  } catch (err) {
    return handleError(res, err, logger);
  }
};

const { aplicarImpactoRanking, fetchPartidoCompat } = partidosService;

module.exports = {
  cargarResultado,
  actualizarProgramacion,
  empezarPartido,
  actualizarMarcadorEnVivo,
  actualizarPartidoEnVivo,
  reprogramarPartido:   actualizarProgramacion,
  actualizarHorario:    actualizarProgramacion,
  aplicarImpactoRanking,
  fetchPartidoCompat,
};
