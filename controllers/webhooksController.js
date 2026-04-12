'use strict';
const webhookService = require('../services/webhookService');
const { handleError } = require('../utils/errors');
const logger = require('../services/logger');

const mercadopago = async (req, res) => {
  try {
    const data = await webhookService.processMercadoPago({
      body:      req.body,
      query:     req.query,
      headers:   req.headers,
      requestId: req.requestId,
      ipAddress: req.ip,
    });
    return res.status(200).json(data);
  } catch (err) {
    return handleError(res, err, logger);
  }
};

module.exports = { mercadopago };
