'use strict';
const suscripcionesService = require('../services/suscripcionesService');
const { handleError } = require('../utils/errors');
const logger = require('../services/logger');
const { trackEvent } = require('../utils/analytics');

const resolveClubId = (req) =>
  req.params?.clubId || req.authUser?.club_id || req.query?.club_id || null;

const getEstado = async (req, res) => {
  try {
    const clubId = resolveClubId(req);
    const data = await suscripcionesService.getEstado(clubId);
    return res.status(200).json(data);
  } catch (err) {
    return handleError(res, err, logger);
  }
};

const cancelar = async (req, res) => {
  try {
    const clubId = resolveClubId(req);
    const data = await suscripcionesService.cancelar(clubId);
    return res.status(200).json(data);
  } catch (err) {
    return handleError(res, err, logger);
  }
};

const anularCambioPendiente = async (req, res) => {
  try {
    const clubId = resolveClubId(req);
    const data = await suscripcionesService.anularCambioPendiente(clubId);
    return res.status(200).json(data);
  } catch (err) {
    return handleError(res, err, logger);
  }
};

const getPlanes = async (_req, res) => {
  try {
    const data = await suscripcionesService.getPlanes();
    return res.status(200).json(data);
  } catch (err) {
    return handleError(res, err, logger);
  }
};

const iniciar = async (req, res) => {
  try {
    const clubId   = resolveClubId(req);
    const planType = String(req.body?.plan_type || '').trim().toLowerCase();
    const data = await suscripcionesService.iniciar({ clubId, planType });
    // FASE 10 — Tracking de conversión (fire-and-forget)
    trackEvent('upgrade_click', { club_id: clubId, plan: planType }).catch(() => {});
    return res.status(200).json(data);
  } catch (err) {
    return handleError(res, err, logger);
  }
};

const getCotizacion = async (_req, res) => {
  try {
    const data = await suscripcionesService.getCotizacion();
    return res.status(200).json(data);
  } catch (err) {
    return handleError(res, err, logger);
  }
};

module.exports = { getEstado, cancelar, anularCambioPendiente, getPlanes, iniciar, getCotizacion };

