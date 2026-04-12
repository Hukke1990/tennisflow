'use strict';

/**
 * services/webhookService.js
 *
 * Lógica de negocio para el procesamiento de webhooks de Mercado Pago.
 * Sin acceso a req/res — recibe los datos necesarios como parámetros.
 */

const crypto    = require('crypto');
const supabase  = require('./supabase');
const { getPlanConfig } = require('./planConfig');
const logger    = require('./logger');
const { fetchMp } = require('./mpClient');
const { AuthError, InternalError } = require('../utils/errors');
const metrics   = require('../utils/metrics');

const STATUS_MAP = {
  authorized: 'authorized',
  paused:     'paused',
  cancelled:  'cancelled',
  pending:    'pending',
};

const PLAN_MAP = {
  basico:  'basico',
  pro:     'pro',
  premium: 'premium',
  test:    'test',
};

const derivePlanFromReason = (reason = '') => {
  const r = reason.toLowerCase();
  if (r.includes('grand slam')) return 'premium';
  if (r.includes('pro'))        return 'pro';
  if (r.includes('test'))       return 'test';
  return null;
};

// ─── Helpers de log / idempotencia ────────────────────────────────────────────

const findExistingLog = async (resourceId, topic, action) => {
  const { data } = await supabase
    .from('log_pagos')
    .select('id, processing_status')
    .eq('mp_resource_id', resourceId)
    .eq('mp_topic', topic)
    .eq('mp_action', action)
    .maybeSingle();
  return data || null;
};

const createProcessingLog = async (entry) => {
  const { data, error } = await supabase
    .from('log_pagos')
    .insert({ ...entry, processing_status: 'processing' })
    .select('id')
    .single();
  if (error) {
    logger.error('[webhook] No se pudo crear log de auditoría', { error, entry });
    return null;
  }
  return data.id;
};

const markLogSuccess = async (logId, extraFields = {}) => {
  if (!logId) return;
  const { error } = await supabase.from('log_pagos').update({
    processing_status: 'success',
    fail_reason:       null,
    ...extraFields,
  }).eq('id', logId);
  if (error) logger.error('[webhook] Error marcando log success', { error, log_id: logId });
};

const markLogFailed = async (logId, failReason) => {
  if (!logId) return;
  const { error } = await supabase.from('log_pagos').update({
    processing_status: 'failed',
    fail_reason:       String(failReason || 'unknown_error').slice(0, 500),
  }).eq('id', logId);
  if (error) logger.error('[webhook] Error marcando log failed', { error, log_id: logId });
};

// ─── Verificación de firma ────────────────────────────────────────────────────

/**
 * Verifica la firma HMAC-SHA256 de Mercado Pago.
 * @param {{ headers: object, query: object, body: object }} ctx
 * @returns {boolean}
 */
const verifyMpSignature = ({ headers, query, body }) => {
  const secret = process.env.MP_WEBHOOK_SECRET?.trim();
  if (!secret) return false;

  const xSignature = headers['x-signature'] || '';
  const xRequestId = headers['x-request-id'] || '';
  const dataId     = query?.['data.id'] || body?.data?.id || '';

  const parts = Object.fromEntries(
    xSignature.split(',').map((p) => p.trim().split('=')),
  );
  const ts = parts['ts'];
  const v1 = parts['v1'];

  if (!ts || !v1) return false;

  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
  const hmac = crypto.createHmac('sha256', secret).update(manifest).digest('hex');

  return crypto.timingSafeEqual(Buffer.from(hmac, 'hex'), Buffer.from(v1, 'hex'));
};

// ─── API pública ─────────────────────────────────────────────────────────────

/**
 * Procesa una notificación de Mercado Pago.
 * @param {{ body: object, query: object, headers: object, requestId: string, ipAddress?: string }} params
 * @returns {Promise<object>} Respuesta a devolver al webhook
 */
const processMercadoPago = async ({ body, query, headers, requestId, ipAddress }) => {
  const earlyBody = body || {};

  // ── 0. Ping de validación ────────────────────────────────────────────────
  const hasRecognizablePayload = (
    (earlyBody.type && earlyBody.data?.id) ||
    (earlyBody.topic && earlyBody.id) ||
    (query?.topic && query?.id)
  );
  if (!hasRecognizablePayload) {
    return { received: true };
  }

  // ── 1. Verificar firma HMAC ──────────────────────────────────────────────
  if (!verifyMpSignature({ headers, query, body })) {
    logger.warn('[webhook] Firma MP inválida — request rechazado', {
      endpoint:   'POST /api/webhooks/mercadopago',
      request_id: headers['x-request-id'] || '',
    });
    throw new AuthError('Firma inválida');
  }

  const mpToken    = process.env.MP_ACCESS_TOKEN;
  const mpCurrency = process.env.MP_CURRENCY_ID || 'USD';

  if (!mpToken) {
    logger.error('[webhook] MP_ACCESS_TOKEN no configurado', {
      endpoint:   'POST /api/webhooks/mercadopago',
      request_id: headers['x-request-id'] || '',
    });
    throw new InternalError('Configuración incompleta');
  }

  // ── 2. Determinar tipo y ID del recurso ──────────────────────────────────
  let resourceType = null;
  let resourceId   = null;

  if (body.type === 'subscription_preapproval' && body.data?.id) {
    resourceType = 'preapproval';
    resourceId   = String(body.data.id);
  } else if ((body.type === 'subscription_authorized_payment' || body.type === 'payment') && body.data?.id) {
    resourceType = 'payment';
    resourceId   = String(body.data.id);
  } else if (body.topic === 'preapproval' && body.id) {
    resourceType = 'preapproval';
    resourceId   = String(body.id);
  } else if (body.topic === 'payment' && body.id) {
    resourceType = 'payment';
    resourceId   = String(body.id);
  } else if (query?.topic === 'preapproval' && query?.id) {
    resourceType = 'preapproval';
    resourceId   = String(query.id);
  } else if (query?.topic === 'payment' && query?.id) {
    resourceType = 'payment';
    resourceId   = String(query.id);
  }

  if (!resourceType || !resourceId) {
    return { received: true };
  }

  const mpAction = (body.action || body.type || 'notification').toLowerCase();

  // ── 3. Rama: payment ─────────────────────────────────────────────────────
  if (resourceType === 'payment') {
    const existingPaymentLog = await findExistingLog(resourceId, 'payment', mpAction);
    if (existingPaymentLog?.processing_status === 'success') {
      logger.info('[webhook] Pago ya procesado exitosamente — skipping', {
        endpoint:    'POST /api/webhooks/mercadopago',
        request_id:  requestId || headers['x-request-id'] || '',
        resource_id: resourceId,
      });
      return { received: true, skipped: true };
    }

    let paymentLogId = existingPaymentLog?.id || null;
    if (paymentLogId) {
      await supabase.from('log_pagos')
        .update({ processing_status: 'processing', fail_reason: null })
        .eq('id', paymentLogId);
      metrics.increment('webhook.retried');
    } else {
      paymentLogId = await createProcessingLog({
        mp_resource_id: resourceId,
        mp_topic:       'payment',
        mp_action:      mpAction,
        raw_body:       body,
        ip_address:     ipAddress,
      });
    }

    let pmData = null;
    try {
      pmData = await fetchMp(`/v1/payments/${resourceId}`, mpToken);
    } catch (err) {
      const isTimeout = err.name === 'TimeoutError' || /timeout/i.test(err.message || '');
      logger.alert('[webhook] Error obteniendo pago MP', {
        alert_type:  isTimeout ? 'timeout_mp' : 'mp_fetch_error',
        endpoint:    'POST /api/webhooks/mercadopago',
        request_id:  requestId || headers['x-request-id'] || '',
        resource_id: resourceId,
        error:       err,
      });
      await markLogFailed(paymentLogId, err.message || 'mp_fetch_error');
      throw new InternalError('No se pudo obtener el pago de MP');
    }

    const clubId = pmData.external_reference ?? null;

    let suscripcionRow = null;
    if (pmData.preapproval_id) {
      const { data } = await supabase
        .from('suscripciones')
        .select('id, plan_id, pending_plan_id, club_id')
        .eq('preapproval_id', pmData.preapproval_id)
        .maybeSingle();
      suscripcionRow = data;
    }
    if (!suscripcionRow && clubId) {
      const { data } = await supabase
        .from('suscripciones')
        .select('id, plan_id, pending_plan_id, club_id')
        .eq('club_id', clubId)
        .maybeSingle();
      suscripcionRow = data;
    }

    const paymentStatus = pmData.status === 'approved' ? 'approved'
      : pmData.status === 'rejected' ? 'rejected'
      : 'pending';

    if (paymentStatus === 'approved' && suscripcionRow?.pending_plan_id && clubId) {
      const newPlan = suscripcionRow.pending_plan_id;
      logger.info('[webhook] Aplicando pending_plan_id', {
        endpoint:     'POST /api/webhooks/mercadopago',
        request_id:   headers['x-request-id'] || '',
        club_id:      clubId,
        plan_anterior: suscripcionRow.plan_id,
        plan_nuevo:    newPlan,
      });

      const { error: clubUpdateErr } = await supabase
        .from('clubes')
        .update({ plan: newPlan, is_active: true })
        .eq('id', clubId);
      if (clubUpdateErr) {
        metrics.increment('club.error_activacion');
        logger.error('[webhook] Error al actualizar plan del club (payment branch)', {
          endpoint:   'POST /api/webhooks/mercadopago',
          request_id: headers['x-request-id'] || '',
          club_id:    clubId,
          error:      clubUpdateErr,
        });
      } else {
        metrics.increment('club.activado');
      }

      const { error: subUpdateErr } = await supabase
        .from('suscripciones')
        .update({ pending_plan_id: null, plan_id: newPlan })
        .eq('id', suscripcionRow.id);
      if (subUpdateErr) {
        logger.error('[webhook] Error al limpiar pending_plan_id', {
          endpoint:   'POST /api/webhooks/mercadopago',
          request_id: headers['x-request-id'] || '',
          club_id:    clubId,
          error:      subUpdateErr,
        });
      }
    }

    if (clubId) {
      const { error: phError } = await supabase.from('pagos_historial').upsert(
        {
          club_id:        clubId,
          suscripcion_id: suscripcionRow?.id ?? null,
          preapproval_id: pmData.preapproval_id ?? null,
          payment_id:     resourceId,
          monto:          pmData.transaction_amount ?? 0,
          currency:       pmData.currency_id ?? mpCurrency,
          plan_id:        suscripcionRow?.plan_id ?? 'basico',
          status:         paymentStatus,
          fecha_pago:     pmData.date_approved ?? pmData.date_created ?? null,
          descripcion:    pmData.description ?? null,
          payer_email:    pmData.payer?.email ?? null,
        },
        { onConflict: 'payment_id' },
      );
      if (phError) {
        logger.error('[webhook] Error al insertar pagos_historial', {
          endpoint:    'POST /api/webhooks/mercadopago',
          request_id:  headers['x-request-id'] || '',
          club_id:     clubId ?? undefined,
          resource_id: resourceId,
          error:       phError,
        });
      }
    }

    await markLogSuccess(paymentLogId, {
      club_id:       clubId,
      mp_status:     paymentStatus,
      mp_raw_status: pmData.status,
      action_taken:  'no_action',
      monto:         pmData.transaction_amount ?? null,
      currency:      pmData.currency_id ?? mpCurrency,
    });

    metrics.increment('webhook.processed');
    return { received: true, type: 'payment', status: pmData.status };
  }

  // ── 4. Rama: preapproval ──────────────────────────────────────────────────
  let mpData    = null;
  let activeLogId = null;

  {
    const existingPreapprovalLog = await findExistingLog(resourceId, 'subscription_preapproval', mpAction);
    if (existingPreapprovalLog?.processing_status === 'success') {
      logger.info('[webhook] Evento ya procesado exitosamente — skipping', {
        endpoint:    'POST /api/webhooks/mercadopago',
        request_id:  requestId || headers['x-request-id'] || '',
        resource_id: resourceId,
      });
      return { received: true, skipped: true };
    }

    if (existingPreapprovalLog) {
      await supabase.from('log_pagos')
        .update({ processing_status: 'processing', fail_reason: null })
        .eq('id', existingPreapprovalLog.id);
      activeLogId = existingPreapprovalLog.id;
      metrics.increment('webhook.retried');
    } else {
      activeLogId = await createProcessingLog({
        mp_resource_id: resourceId,
        mp_topic:       'subscription_preapproval',
        mp_action:      mpAction,
        raw_body:       body,
        ip_address:     ipAddress,
      });
    }
  }

  try {
    mpData = await fetchMp(`/preapproval/${resourceId}`, mpToken);
  } catch (err) {
    const isTimeout = err.name === 'TimeoutError' || /timeout/i.test(err.message || '');
    logger.alert('[webhook] Error obteniendo preapproval MP', {
      alert_type:  isTimeout ? 'timeout_mp' : 'mp_fetch_error',
      endpoint:    'POST /api/webhooks/mercadopago',
      request_id:  requestId || headers['x-request-id'] || '',
      resource_id: resourceId,
      error:       err,
    });
    await markLogFailed(activeLogId, err.message || 'mp_fetch_error');
    throw new InternalError('No se pudo obtener el preapproval de MP');
  }

  try {
    const newSubscriptionStatus = STATUS_MAP[mpData.status] ?? 'pending';
    const clubId = mpData.external_reference ?? null;

    let planAnterior = null;
    let planNuevo    = null;
    let actionTaken  = 'no_action';

    if (clubId) {
      const { data: clubRow } = await supabase
        .from('clubes')
        .select('plan')
        .eq('id', clubId)
        .maybeSingle();
      planAnterior = clubRow?.plan ?? null;

      const { data: subRowByPreapproval } = await supabase
        .from('suscripciones')
        .select('id, plan_id')
        .eq('preapproval_id', resourceId)
        .maybeSingle();

      let subRow = subRowByPreapproval;

      if (!subRow && mpData.preapproval_plan_id) {
        const { data: subRowByTemplate } = await supabase
          .from('suscripciones')
          .select('id, plan_id')
          .eq('preapproval_id', mpData.preapproval_plan_id)
          .maybeSingle();
        subRow = subRowByTemplate;
      }

      if (!subRow && clubId) {
        const { data: subRowByClub } = await supabase
          .from('suscripciones')
          .select('id, plan_id')
          .eq('club_id', clubId)
          .maybeSingle();
        subRow = subRowByClub;
      }

      const planFromReason = derivePlanFromReason(mpData.reason);
      const resolvedPlanId = planFromReason ?? subRow?.plan_id ?? 'basico';

      const nextPaymentDate =
        mpData.summarized?.next_payment_date ??
        mpData.next_payment_date ??
        null;

      const shouldDowngradePlan = ['cancelled', 'paused'].includes(newSubscriptionStatus);

      const upsertPayload = {
        club_id:            clubId,
        plan_id:            shouldDowngradePlan ? 'basico' : resolvedPlanId,
        preapproval_id:     resourceId,
        status:             newSubscriptionStatus,
        next_payment_date:  nextPaymentDate,
        payer_email:        mpData.payer_email ?? null,
        external_reference: clubId,
      };

      const { error: subError } = await supabase
        .from('suscripciones')
        .upsert(upsertPayload, { onConflict: 'club_id' });

      if (subError) {
        logger.error('[webhook] Error al actualizar suscripción', {
          endpoint:   'POST /api/webhooks/mercadopago',
          request_id: headers['x-request-id'] || '',
          club_id:    clubId ?? undefined,
          error:      subError,
        });
      }

      if (newSubscriptionStatus === 'authorized') {
        const targetPlan = PLAN_MAP[resolvedPlanId] ?? null;
        if (targetPlan) {
          const { error: clubError } = await supabase
            .from('clubes')
            .update({ plan: targetPlan, is_active: true })
            .eq('id', clubId);

          if (!clubError) {
            planNuevo   = targetPlan;
            actionTaken = planAnterior !== targetPlan ? 'plan_upgraded' : 'no_action';
            metrics.increment('club.activado');
            logger.info('[webhook] Plan de club actualizado', {
              endpoint:      'POST /api/webhooks/mercadopago',
              request_id:    headers['x-request-id'] || '',
              club_id:       clubId,
              plan_anterior: planAnterior,
              plan_nuevo:    targetPlan,
            });
          } else {
            logger.error('[webhook] Error al actualizar plan del club', {
              endpoint:   'POST /api/webhooks/mercadopago',
              request_id: headers['x-request-id'] || '',
              club_id:    clubId,
              error:      clubError,
            });
            actionTaken = 'error';
          }

          if (subRow?.id) {
            const planAmounts = { basico: 30, pro: 50, premium: 70 };
            const amt = planAmounts[resolvedPlanId] ?? 0;
            await supabase.from('pagos_historial').insert({
              club_id:        clubId,
              suscripcion_id: subRow.id,
              preapproval_id: resourceId,
              payment_id:     null,
              monto:          amt,
              currency:       mpCurrency,
              plan_id:        subRow.plan_id,
              status:         'approved',
              fecha_pago:     new Date().toISOString(),
              descripcion:    mpData.reason ?? null,
              payer_email:    mpData.payer_email ?? null,
            });
          }
        }
      }

      if (shouldDowngradePlan) {
        const { error: pendingError } = await supabase
          .from('suscripciones')
          .update({ pending_plan_id: 'basico' })
          .eq('club_id', clubId);

        if (!pendingError) {
          planNuevo   = planAnterior;
          actionTaken = 'pending_downgrade';
          logger.info('[webhook] Downgrade diferido marcado', {
            endpoint:   'POST /api/webhooks/mercadopago',
            request_id: headers['x-request-id'] || '',
            club_id:    clubId,
            mp_status:  newSubscriptionStatus,
          });
        } else {
          logger.error('[webhook] Error al marcar pending_plan_id', {
            endpoint:   'POST /api/webhooks/mercadopago',
            request_id: headers['x-request-id'] || '',
            club_id:    clubId,
            error:      pendingError,
          });
          actionTaken = 'error';
        }
      }
    }

    await markLogSuccess(activeLogId, {
      club_id:       clubId,
      mp_status:     newSubscriptionStatus,
      mp_raw_status: mpData.status,
      action_taken:  actionTaken,
      plan_anterior: planAnterior,
      plan_nuevo:    planNuevo,
    });

    metrics.increment('webhook.processed');
    return {
      received:    true,
      type:        'preapproval',
      status:      newSubscriptionStatus,
      action_taken: actionTaken,
    };
  } catch (processingErr) {
    logger.alert('[webhook] Excepción procesando preapproval', {
      alert_type:  'webhook_failed',
      endpoint:    'POST /api/webhooks/mercadopago',
      request_id:  requestId || headers['x-request-id'] || '',
      resource_id: resourceId,
      error:       processingErr,
    });
    metrics.increment('webhook.failed');
    await markLogFailed(activeLogId, processingErr.message || 'processing_error');
    throw new InternalError('Error interno procesando webhook');
  }
};

module.exports = { processMercadoPago };
