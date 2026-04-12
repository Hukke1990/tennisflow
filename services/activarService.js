'use strict';

/**
 * services/activarService.js
 *
 * Lógica de negocio para el flujo público de activación de club.
 * Sin acceso a req/res — eso es responsabilidad del controller.
 */

const supabase = require('./supabase');
const { getPlanConfig, formatPrice } = require('./planConfig');
const logger  = require('./logger');
const metrics = require('../utils/metrics');
const { fetchCotizacion } = require('../utils/fetchCotizacion');
const { NotFoundError, ValidationError, ConflictError, BadGatewayError, InternalError } = require('../utils/errors');

const MP_FETCH_TIMEOUT_MS = 8000;

const PLAN_PRICES_ACTIVACION = {
  basico:  { amount: 30, reason: 'SetGo Básico — Suscripción mensual' },
  pro:     { amount: 50, reason: 'SetGo Pro — Suscripción mensual' },
  premium: { amount: 70, reason: 'SetGo Grand Slam — Suscripción mensual' },
  test:    { amount: 0,  reason: 'SetGo Test — Plan de prueba', amount_ars_override: 15 },
};

const PLAN_MAP = { basico: 'basico', pro: 'pro', premium: 'premium', test: 'test' };

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Obtiene los datos básicos de un club para la página de activación.
 * @param {string} clubId
 */
const getClubParaActivar = async (clubId) => {
  if (!clubId) throw new ValidationError('Club ID requerido.');

  const { data: club, error } = await supabase
    .from('clubes')
    .select('id, nombre, slug, is_active, plan')
    .eq('id', clubId)
    .maybeSingle();

  if (error) {
    logger.error('[activar] Error al obtener club:', error);
    throw new InternalError('Error al obtener el club.');
  }
  if (!club) throw new NotFoundError('Club no encontrado.');

  return {
    id:        club.id,
    nombre:    club.nombre,
    slug:      club.slug,
    is_active: club.is_active ?? false,
    plan:      club.plan,
  };
};

/**
 * Crea un preapproval_plan en MP e inicia el flujo de pago para activar un club.
 * @param {{ clubId: string, planType: string }} params
 */
const iniciarPago = async ({ clubId, planType }) => {
  if (!clubId) throw new ValidationError('Club ID requerido.');

  if (!PLAN_PRICES_ACTIVACION[planType]) {
    throw new ValidationError('plan_type inválido. Valores aceptados: basico, pro, premium.');
  }

  const { data: club, error: clubError } = await supabase
    .from('clubes')
    .select('id, nombre, slug, is_active')
    .eq('id', clubId)
    .maybeSingle();

  if (clubError || !club) throw new NotFoundError('Club no encontrado.');

  if (club.is_active) {
    throw new ConflictError(
      'Este club ya está activo. Usá el panel de suscripciones para cambiar tu plan.',
    );
  }

  const mpAccessToken = process.env.MP_ACCESS_TOKEN;
  if (!mpAccessToken) throw new InternalError('Configuración de pago incompleta en el servidor.');

  const cotizacion = await fetchCotizacion();
  const { amount, reason, amount_ars_override } = PLAN_PRICES_ACTIVACION[planType];
  const monto_ars = amount_ars_override ?? Math.round(amount * cotizacion);

  const appUrl   = (process.env.APP_URL || 'https://setgo-app.vercel.app').trim();
  const backBase = (process.env.MP_BACK_URL || appUrl).trim();
  const isLocalhost = backBase.includes('localhost') || backBase.includes('127.0.0.1');
  const backUrl  = isLocalhost
    ? 'https://www.mercadopago.com.ar/subscriptions'
    : `${backBase}/activar/${clubId}?pago=exito&plan=${planType}`;

  const webhookUrl = (process.env.MP_WEBHOOK_URL || '').trim();

  const mpPayload = {
    reason,
    auto_recurring: {
      frequency:          1,
      frequency_type:     'months',
      transaction_amount: monto_ars,
      currency_id:        'ARS',
    },
    back_url:           backUrl,
    external_reference: clubId,
    ...(webhookUrl && { notification_url: webhookUrl }),
  };

  const mpResponse = await fetch('https://api.mercadopago.com/preapproval_plan', {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${mpAccessToken}`,
      'Content-Type': 'application/json',
    },
    body:   JSON.stringify(mpPayload),
    signal: AbortSignal.timeout(MP_FETCH_TIMEOUT_MS),
  });

  if (!mpResponse.ok) {
    const mpError = await mpResponse.text();
    logger.error('[activar] Error al crear preapproval_plan en MP', {
      club_id: clubId,
      error:   { message: mpError, code: String(mpResponse.status) },
    });
    throw new BadGatewayError('No se pudo iniciar el pago con Mercado Pago.', { detail: mpError });
  }

  const mpData      = await mpResponse.json();
  const init_point  = mpData?.init_point;
  const preapprovalId = mpData?.id;

  if (!init_point) throw new BadGatewayError('Mercado Pago no devolvió URL de pago.');

  await supabase.from('suscripciones').upsert(
    {
      club_id:            clubId,
      plan_id:            planType,
      preapproval_id:     preapprovalId,
      status:             mpData.status ?? 'pending',
      external_reference: clubId,
    },
    { onConflict: 'club_id' },
  );

  const planCfg = getPlanConfig(planType);

  return {
    init_point,
    plan:          planType,
    plan_label:    planCfg.label,
    price_usd:     amount,
    price_display: formatPrice(amount),
    monto_ars,
    cotizacion,
  };
};

/**
 * Verifica si el pago de activación fue aprobado consultando a MP.
 * @param {string} clubId
 */
const verificarPago = async (clubId) => {
  if (!clubId) throw new ValidationError('Club ID requerido.');

  const mpToken = process.env.MP_ACCESS_TOKEN;
  if (!mpToken) throw new InternalError('Configuración incompleta.');

  // Verificar si ya está activo (ej: webhook lo procesó antes)
  const { data: clubEarly } = await supabase
    .from('clubes')
    .select('is_active, plan, slug')
    .eq('id', clubId)
    .maybeSingle();

  if (clubEarly?.is_active) {
    return { is_active: true, plan: clubEarly.plan, slug: clubEarly.slug };
  }

  const { data: sub } = await supabase
    .from('suscripciones')
    .select('preapproval_id, plan_id, status')
    .eq('club_id', clubId)
    .maybeSingle();

  if (!sub?.preapproval_id) {
    return { is_active: false, reason: 'sin_suscripcion' };
  }

  let mpStatus = null;
  const resolvedPlanId = sub.plan_id ?? 'basico';

  // Llamada 1: buscar suscripción activa con external_reference del club
  try {
    const searchRes = await fetch(
      `https://api.mercadopago.com/preapproval/search?preapproval_plan_id=${sub.preapproval_id}&external_reference=${clubId}`,
      {
        headers: { Authorization: `Bearer ${mpToken}` },
        signal:  AbortSignal.timeout(MP_FETCH_TIMEOUT_MS),
      },
    );
    if (searchRes.ok) {
      const searchData = await searchRes.json();
      const instances  = searchData?.results ?? [];
      const authorized = instances.find((i) => i.status === 'authorized');
      if (authorized) {
        mpStatus = 'authorized';
      } else if (instances.length > 0) {
        mpStatus = instances[0].status;
      }
    }
  } catch (err) {
    logger.error('[activar] Timeout o error en búsqueda MP (call 1)', { club_id: clubId, error: err });
  }

  // Llamada 2 (fallback): buscar sin external_reference
  if (!mpStatus) {
    try {
      const searchRes2 = await fetch(
        `https://api.mercadopago.com/preapproval/search?preapproval_plan_id=${sub.preapproval_id}`,
        {
          headers: { Authorization: `Bearer ${mpToken}` },
          signal:  AbortSignal.timeout(MP_FETCH_TIMEOUT_MS),
        },
      );
      if (searchRes2.ok) {
        const searchData2 = await searchRes2.json();
        const instances2  = searchData2?.results ?? [];
        const authorized2 = instances2.find((i) => i.status === 'authorized');
        if (authorized2) {
          mpStatus = 'authorized';
        } else if (instances2.length > 0) {
          mpStatus = instances2[0].status;
        }
      }
    } catch (err) {
      logger.error('[activar] Timeout o error en búsqueda MP (call 2 fallback)', { club_id: clubId, error: err });
    }
  }

  if (mpStatus === 'authorized') {
    const targetPlan = PLAN_MAP[resolvedPlanId] ?? 'basico';

    await Promise.all([
      supabase.from('clubes').update({ is_active: true, plan: targetPlan }).eq('id', clubId),
      supabase.from('suscripciones').update({ status: 'authorized' }).eq('club_id', clubId),
    ]);

    metrics.increment('club.activado');
    const { data: club } = await supabase
      .from('clubes')
      .select('slug')
      .eq('id', clubId)
      .maybeSingle();

    return { is_active: true, plan: targetPlan, slug: club?.slug ?? null };
  }

  // Verificar si webhook lo activó mientras procesábamos
  const { data: club } = await supabase
    .from('clubes')
    .select('is_active, plan, slug')
    .eq('id', clubId)
    .maybeSingle();

  if (club?.is_active) {
    return { is_active: true, plan: club.plan, slug: club.slug };
  }

  return { is_active: false, mp_status: mpStatus, reason: 'pendiente' };
};

module.exports = { getClubParaActivar, iniciarPago, verificarPago };
