'use strict';
const activarService = require('../services/activarService');
const { handleError } = require('../utils/errors');
const logger = require('../services/logger');

const getClubParaActivar = async (req, res) => {
  try {
    const clubId = String(req.params?.clubId || '').trim();
    const data = await activarService.getClubParaActivar(clubId);
    return res.status(200).json(data);
  } catch (err) {
    return handleError(res, err, logger);
  }
};

// ── POST /api/activar/:clubId/pagar ───────────────────────────────────────────

const iniciarPago = async (req, res) => {
  try {
    const clubId   = String(req.params?.clubId || '').trim();
    const planType = String(req.body?.plan_type || '').trim().toLowerCase();
    const data = await activarService.iniciarPago({ clubId, planType });
    return res.status(200).json(data);
  } catch (err) {
    return handleError(res, err, logger);
  }
};

// ── GET /api/activar/:clubId/verificar ─────────────────────────────────────

const verificarPago = async (req, res) => {
  try {
    const clubId = String(req.params?.clubId || '').trim();
    const data = await activarService.verificarPago(clubId);
    return res.status(200).json(data);
  } catch (err) {
    return handleError(res, err, logger);
  }
};

module.exports = { getClubParaActivar, iniciarPago, verificarPago };

