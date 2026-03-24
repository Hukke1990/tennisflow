/**
 * controllers/webhooksController.js
 *
 * Maneja notificaciones entrantes de Mercado Pago.
 *
 * Endpoint:  POST /api/webhooks/mercadopago
 * Auth:       Ninguna (MP no envía token). Verificación con HMAC-SHA256
 *             si MP_WEBHOOK_SECRET está configurado.
 *
 * Variables de entorno requeridas:
 *   MP_ACCESS_TOKEN      → Para consultar el recurso a la API de MP
 *   MP_WEBHOOK_SECRET    → (Recomendado) Secret para validar firma x-signature de MP
 *   MP_CURRENCY_ID       → Moneda del cobro (default: 'USD')
 */

const crypto = require('crypto');
const supabase = require('../services/supabase');
const { getPlanConfig } = require('../services/planConfig');

// ── Constantes ────────────────────────────────────────────────────────────────

const MP_API = 'https://api.mercadopago.com';

// Mapa de estados MP → estado interno de la suscripción
const STATUS_MAP = {
  authorized: 'authorized',
  paused:     'paused',
  cancelled:  'cancelled',
  pending:    'pending',
};

// Qué plan de TennisFlow corresponde a cada plan_id de la suscripción
const PLAN_MAP = {
  basico:  'basico',
  pro:     'pro',
  premium: 'premium',
  test:    'test',
};

/**
 * Deriva el plan_id desde el campo `reason` de MP, que contiene el nombre del plan.
 * Usado como fuente de verdad cuando la fila de suscripciones no tiene el plan correcto.
 */
const derivePlanFromReason = (reason = '') => {
  const r = reason.toLowerCase();
  if (r.includes('grand slam')) return 'premium';
  if (r.includes('pro'))        return 'pro';
  if (r.includes('test'))       return 'test';
  return null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Verifica la firma HMAC-SHA256 que Mercado Pago envía en el header `x-signature`.
 * Si MP_WEBHOOK_SECRET no está configurado, devuelve `true` (verificación opcional).
 * Documentación MP: https://www.mercadopago.com/developers/es/docs/your-integrations/notifications/webhooks
 */
const verifyMpSignature = (req) => {
  const secret = process.env.MP_WEBHOOK_SECRET?.trim();
  if (!secret) return true; // sin secret → aceptar todo (solo para desarrollo)

  const xSignature  = req.headers['x-signature'] || '';
  const xRequestId  = req.headers['x-request-id'] || '';
  const dataId      = req.query?.['data.id'] || req.body?.data?.id || '';

  // Extraer ts y v1 del header x-signature
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

/**
 * Consulta un recurso en la API de Mercado Pago.
 * @param {string} path  - Ruta relativa, ej: '/preapproval/123'
 * @param {string} token - MP_ACCESS_TOKEN
 */
const fetchMp = async (path, token) => {
  const res = await fetch(`${MP_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MP ${res.status}: ${text}`);
  }
  return res.json();
};

/**
 * Inserta un registro de auditoría en log_pagos.
 * No lanza errores — los fallos son logueados pero no bloquean la respuesta.
 */
const insertLog = async (entry) => {
  const { error } = await supabase.from('log_pagos').insert(entry);
  if (error) console.error('[webhook] Error al insertar log_pagos:', error);
};

// ── Controlador principal ─────────────────────────────────────────────────────

const mercadopago = async (req, res) => {
  // ── 1. Verificar firma HMAC (si MP_WEBHOOK_SECRET está configurado) ─────────
  if (!verifyMpSignature(req)) {
    console.warn('[webhook] Firma MP inválida — request rechazado');
    return res.status(401).json({ error: 'Firma inválida' });
  }

  const mpToken    = process.env.MP_ACCESS_TOKEN;
  const mpCurrency = process.env.MP_CURRENCY_ID || 'USD';
  const ipAddress  = req.ip || req.headers['x-forwarded-for'] || null;

  if (!mpToken) {
    console.error('[webhook] MP_ACCESS_TOKEN no configurado');
    return res.status(500).json({ error: 'Configuración incompleta' });
  }

  // ── 2. Determinar tipo y ID del recurso notificado ────────────────────────
  const body = req.body || {};

  let resourceType = null; // 'preapproval' | 'payment'
  let resourceId   = null;
  let rawBody      = body;

  // Formato Notifications API v2
  if (body.type === 'subscription_preapproval' && body.data?.id) {
    resourceType = 'preapproval';
    resourceId   = String(body.data.id);
  } else if ((body.type === 'subscription_authorized_payment' || body.type === 'payment') && body.data?.id) {
    resourceType = 'payment';
    resourceId   = String(body.data.id);
  }
  // Formato IPN clásico
  else if (body.topic === 'preapproval' && body.id) {
    resourceType = 'preapproval';
    resourceId   = String(body.id);
  } else if (body.topic === 'payment' && body.id) {
    resourceType = 'payment';
    resourceId   = String(body.id);
  }
  // Query string (MP puede enviarlo así)
  else if (req.query?.topic === 'preapproval' && req.query?.id) {
    resourceType = 'preapproval';
    resourceId   = String(req.query.id);
  } else if (req.query?.topic === 'payment' && req.query?.id) {
    resourceType = 'payment';
    resourceId   = String(req.query.id);
  }

  // MP puede enviar pings de verificación sin datos — responder 200 siempre
  if (!resourceType || !resourceId) {
    return res.status(200).json({ received: true });
  }

  // ── 3. Rama: notificación de cobro individual ─────────────────────────────
  if (resourceType === 'payment') {
    let pmData = null;

    try {
      pmData = await fetchMp(`/v1/payments/${resourceId}`, mpToken);
    } catch (err) {
      console.error('[webhook] Error al obtener pago MP:', err.message);
      // Responder 200 para evitar reintentos MP en loop
      return res.status(200).json({ received: true, warning: 'No se pudo obtener el pago' });
    }

    const clubId = pmData.external_reference ?? null;

    // Buscar suscripción vinculada para obtener suscripcion_id, plan_id y pending_plan_id
    let suscripcionRow = null;
    if (pmData.preapproval_id) {
      const { data } = await supabase
        .from('suscripciones')
        .select('id, plan_id, pending_plan_id, club_id')
        .eq('preapproval_id', pmData.preapproval_id)
        .maybeSingle();
      suscripcionRow = data;
    }
    // Fallback por club_id si no encontramos por preapproval_id
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

    // Si el cobro fue aprobado y hay un cambio de plan pendiente, aplicarlo ahora
    if (paymentStatus === 'approved' && suscripcionRow?.pending_plan_id && clubId) {
      const newPlan = suscripcionRow.pending_plan_id;
      console.log(`[webhook] Aplicando pending_plan_id: ${suscripcionRow.plan_id} → ${newPlan} (club ${clubId})`);
      await Promise.all([
        supabase.from('clubes').update({ plan: newPlan, is_active: true }).eq('id', clubId),
        supabase.from('suscripciones').update({ pending_plan_id: null, plan_id: newPlan }).eq('id', suscripcionRow.id),
      ]);
    }

    // Insertar en pagos_historial (upsert para idempotencia)
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
      if (phError) console.error('[webhook] Error al insertar pagos_historial:', phError);
    }

    await insertLog({
      club_id:       clubId,
      mp_resource_id: resourceId,
      mp_topic:       'payment',
      mp_status:      paymentStatus,
      mp_raw_status:  pmData.status,
      action_taken:   'no_action',
      monto:          pmData.transaction_amount ?? null,
      currency:       pmData.currency_id ?? mpCurrency,
      raw_body:       rawBody,
      ip_address:     ipAddress,
    });

    return res.status(200).json({ received: true, type: 'payment', status: pmData.status });
  }

  // ── 4. Rama: notificación de cambio de estado del preapproval ────────────
  let mpData = null;

  try {
    mpData = await fetchMp(`/preapproval/${resourceId}`, mpToken);
  } catch (err) {
    console.error('[webhook] Error al obtener preapproval MP:', err.message);
    return res.status(200).json({ received: true, warning: 'No se pudo obtener el preapproval' });
  }

  const newSubscriptionStatus = STATUS_MAP[mpData.status] ?? 'pending';
  const clubId = mpData.external_reference ?? null;

  // Determinar estado anterior del club para el log
  let planAnterior = null;
  let planNuevo    = null;
  let actionTaken  = 'no_action';

  if (clubId) {
    // Obtener plan actual del club
    const { data: clubRow } = await supabase
      .from('clubes')
      .select('plan')
      .eq('id', clubId)
      .maybeSingle();

    planAnterior = clubRow?.plan ?? null;

    // Obtener plan_id de la suscripción activa.
    // Estrategia en cascada:
    //   1. Buscar por preapproval_id de instancia (ya conocida)
    //   2. Buscar por preapproval_plan_id = template ID que `iniciar` guardó
    //   3. Fallback por club_id
    const { data: subRowByPreapproval } = await supabase
      .from('suscripciones')
      .select('id, plan_id')
      .eq('preapproval_id', resourceId)
      .maybeSingle();

    let subRow = subRowByPreapproval;

    // Fallback 2: buscar por el template ID (preapproval_plan_id en la respuesta de MP)
    if (!subRow && mpData.preapproval_plan_id) {
      const { data: subRowByTemplate } = await supabase
        .from('suscripciones')
        .select('id, plan_id')
        .eq('preapproval_id', mpData.preapproval_plan_id)
        .maybeSingle();
      subRow = subRowByTemplate;
    }

    // Fallback 3: buscar por club_id
    if (!subRow && clubId) {
      const { data: subRowByClub } = await supabase
        .from('suscripciones')
        .select('id, plan_id')
        .eq('club_id', clubId)
        .maybeSingle();
      subRow = subRowByClub;
    }

    // Determinar plan_id: prioridad → reason de MP > subRow en DB > basico
    const planFromReason = derivePlanFromReason(mpData.reason);
    const resolvedPlanId = planFromReason ?? subRow?.plan_id ?? 'basico';

    // ── Actualizar estado de la suscripción ─────────────────────────────────
    const nextPaymentDate =
      mpData.summarized?.next_payment_date ??
      mpData.next_payment_date ??
      null;

    const shouldDowngradePlan = ['cancelled', 'paused'].includes(newSubscriptionStatus);

    const upsertPayload = {
      club_id:          clubId,
      plan_id:          shouldDowngradePlan ? 'basico' : resolvedPlanId,
      preapproval_id:   resourceId,   // actualiza al ID real de la instancia de suscripción
      status:           newSubscriptionStatus,
      next_payment_date: nextPaymentDate,
      payer_email:      mpData.payer_email ?? null,
      external_reference: clubId,
    };

    const { error: subError } = await supabase
      .from('suscripciones')
      .upsert(upsertPayload, { onConflict: 'club_id' });

    if (subError) console.error('[webhook] Error al actualizar suscripción:', subError);

    // ── Actualizar plan en clubes + disparar Realtime ────────────────────────
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
          console.log(`[webhook] Club ${clubId}: plan ${planAnterior} → ${targetPlan}`);
        } else {
          console.error('[webhook] Error al actualizar plan del club:', clubError);
          actionTaken = 'error';
        }
      }

      // Registrar en pagos_historial si no viene pago individual
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

    // ── Degradar plan si es cancelada / pausada (diferido) ──────────────────
    // NO degradamos el plan del club inmediatamente: el usuario ya pagó el mes actual.
    // Marcamos pending_plan_id='basico' para que el cron lo aplique al vencer el período.
    const shouldDowngrade = shouldDowngradePlan;

    if (shouldDowngrade) {
      const { error: pendingError } = await supabase
        .from('suscripciones')
        .update({ pending_plan_id: 'basico' })
        .eq('club_id', clubId);

      if (!pendingError) {
        planNuevo   = planAnterior; // el plan NO cambia todavía
        actionTaken = 'pending_downgrade';
        console.log(`[webhook] Club ${clubId}: downgrade a básico diferido (${newSubscriptionStatus})`);
      } else {
        console.error('[webhook] Error al marcar pending_plan_id:', pendingError);
        actionTaken = 'error';
      }
    }
  }

  // ── 5. Registrar en log_pagos ─────────────────────────────────────────────
  await insertLog({
    club_id:        clubId,
    mp_resource_id: resourceId,
    mp_topic:       'subscription_preapproval',
    mp_status:      newSubscriptionStatus,
    mp_raw_status:  mpData.status,
    action_taken:   actionTaken,
    plan_anterior:  planAnterior,
    plan_nuevo:     planNuevo,
    monto:          null,
    currency:       null,
    raw_body:       rawBody,
    ip_address:     ipAddress,
  });

  return res.status(200).json({
    received:    true,
    type:        'preapproval',
    status:      newSubscriptionStatus,
    action_taken: actionTaken,
  });
};

module.exports = { mercadopago };
