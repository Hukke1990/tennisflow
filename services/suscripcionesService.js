'use strict';

/**
 * services/suscripcionesService.js
 *
 * Lógica de negocio para gestión de suscripciones.
 * Sin acceso a req/res — eso es responsabilidad del controller.
 */

const supabase = require('./supabase');
const logger = require('./logger');
const { getPlanConfig, formatPrice, CURRENCY, PLAN_CONFIG } = require('./planConfig');
const { fetchCotizacion, DOLAR_FALLBACK } = require('../utils/fetchCotizacion');
const { ValidationError, NotFoundError, ConflictError, InternalError, BadGatewayError } = require('../utils/errors');

const PLAN_PRICES_MP = {
  pro:     { amount: 50, reason: 'SetGo Pro — Suscripción mensual' },
  premium: { amount: 70, reason: 'SetGo Grand Slam — Suscripción mensual' },
  test:    { amount: 0,  reason: 'SetGo Test — Plan de prueba', amount_ars_override: 15 },
};

const buildBackUrl = (plan_type, slug) => {
  const appUrl    = (process.env.APP_URL || '').trim();
  const backBase  = (process.env.MP_BACK_URL || appUrl).trim();
  const isLocalhost = backBase.includes('localhost') || backBase.includes('127.0.0.1');
  if (isLocalhost) return 'https://www.mercadopago.com.ar/subscriptions';
  return `${backBase}/suscripcion/exito?plan=${plan_type}&slug=${slug}`;
};

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Devuelve el estado actual de la suscripción del club.
 * @param {string} clubId
 */
const getEstado = async (clubId) => {
  if (!clubId) throw new ValidationError('No se pudo determinar el club.');

  const { data, error } = await supabase
    .from('suscripciones')
    .select('id, plan_id, status, next_payment_date, payer_email, pending_plan_id, created_at, updated_at')
    .eq('club_id', clubId)
    .maybeSingle();

  if (error) {
    logger.error('Error al obtener suscripción:', error);
    throw new InternalError('No se pudo obtener el estado de la suscripción.');
  }

  if (!data) {
    const planCfg = getPlanConfig('basico');
    return {
      suscripcion: null,
      plan: 'basico',
      plan_label: planCfg.label,
      monthly_price_usd: planCfg.monthly_price_usd,
      currency: CURRENCY,
      price_display: formatPrice(planCfg.monthly_price_usd),
      tax_disclaimer: 'Impuestos no incluidos',
      activa: false,
    };
  }

  const planCfg = getPlanConfig(data.plan_id);
  const activa  = data.status === 'authorized';

  return {
    suscripcion: data,
    plan: data.plan_id,
    plan_label: planCfg.label,
    monthly_price_usd: planCfg.monthly_price_usd,
    currency: CURRENCY,
    price_display: formatPrice(planCfg.monthly_price_usd),
    tax_disclaimer: 'Impuestos no incluidos',
    activa,
    pending_plan_id: data.pending_plan_id ?? null,
  };
};

/**
 * Cancela la suscripción activa del club en MP y en DB.
 * @param {string} clubId
 */
const cancelar = async (clubId) => {
  if (!clubId) throw new ValidationError('No se pudo determinar el club.');

  const { data: suscripcion, error: fetchError } = await supabase
    .from('suscripciones')
    .select('id, preapproval_id, status')
    .eq('club_id', clubId)
    .maybeSingle();

  if (fetchError) {
    logger.error('Error al obtener suscripción para cancelar:', fetchError);
    throw new InternalError('Error al obtener la suscripción.');
  }

  if (!suscripcion || !suscripcion.preapproval_id) {
    throw new NotFoundError('No hay suscripción activa para cancelar.');
  }

  if (suscripcion.status === 'cancelled') {
    throw new ConflictError('La suscripción ya está cancelada.');
  }

  const mpAccessToken = process.env.MP_ACCESS_TOKEN;
  if (!mpAccessToken) throw new InternalError('Configuración de pago incompleta en el servidor.');

  let realPreapprovalId = suscripcion.preapproval_id;

  const tryCancel = (preapprovalId) => fetch(
    `https://api.mercadopago.com/preapproval/${preapprovalId}`,
    {
      method: 'PUT',
      headers: {
        Authorization:  `Bearer ${mpAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'cancelled' }),
    },
  );

  let mpResponse = await tryCancel(realPreapprovalId);

  if (!mpResponse.ok) {
    logger.warn(`[cancelar] preapproval_id ${realPreapprovalId} falló (${mpResponse.status}). Buscando por external_reference…`);
    try {
      const searchRes = await fetch(
        `https://api.mercadopago.com/preapproval/search?external_reference=${clubId}&limit=5`,
        { headers: { Authorization: `Bearer ${mpAccessToken}` } },
      );
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        const active = (searchData.results ?? []).find(
          (r) => r.status === 'authorized' || r.status === 'pending',
        );
        if (active) {
          realPreapprovalId = active.id;
          mpResponse = await tryCancel(realPreapprovalId);
        }
      }
    } catch (searchErr) {
      logger.error('[cancelar] Error buscando suscripción en MP:', searchErr.message);
    }
  }

  if (!mpResponse.ok) {
    const mpError = await mpResponse.text();
    logger.error('Error al cancelar en MP:', mpResponse.status, mpError);
    throw new BadGatewayError(
      'No se pudo cancelar la suscripción en Mercado Pago.',
      { detail: mpError },
    );
  }

  await supabase
    .from('suscripciones')
    .update({
      status:          'cancelled',
      plan_id:         'basico',
      preapproval_id:  realPreapprovalId,
      pending_plan_id: 'basico',
    })
    .eq('club_id', clubId);

  return {
    message:         'Suscripción cancelada. Seguirás con tu plan actual hasta que venza el período pagado.',
    pending_plan_id: 'basico',
  };
};

/**
 * Cancela un cambio de plan pendiente (y opcionalmente reactiva en MP).
 * @param {string} clubId
 */
const anularCambioPendiente = async (clubId) => {
  if (!clubId) throw new ValidationError('No se pudo determinar el club.');

  const { data: suscripcion, error: fetchError } = await supabase
    .from('suscripciones')
    .select('id, status, preapproval_id, plan_id, pending_plan_id')
    .eq('club_id', clubId)
    .maybeSingle();

  if (fetchError || !suscripcion) {
    throw new NotFoundError('No hay suscripción registrada.');
  }

  if (!suscripcion.pending_plan_id) {
    throw new ConflictError('No hay ningún cambio pendiente para anular.');
  }

  const mpAccessToken = process.env.MP_ACCESS_TOKEN;

  if (suscripcion.status === 'cancelled' && suscripcion.preapproval_id && mpAccessToken) {
    try {
      const mpRes = await fetch(
        `https://api.mercadopago.com/preapproval/${suscripcion.preapproval_id}`,
        {
          method:  'PUT',
          headers: { Authorization: `Bearer ${mpAccessToken}`, 'Content-Type': 'application/json' },
          body:    JSON.stringify({ status: 'authorized' }),
        },
      );
      if (mpRes.ok) {
        await Promise.all([
          supabase.from('suscripciones').update({ status: 'authorized', pending_plan_id: null }).eq('club_id', clubId),
          supabase.from('clubes').update({ plan: suscripcion.plan_id }).eq('id', clubId),
        ]);
        return { message: 'Cambio pendiente anulado. Tu suscripción sigue activa.', reactivada: true };
      }
      logger.warn('[anularCambioPendiente] MP no permitió reactivar:', await mpRes.text());
    } catch (err) {
      logger.error('[anularCambioPendiente] Error al reactivar en MP:', err.message);
    }
  }

  await supabase.from('suscripciones').update({ pending_plan_id: null }).eq('club_id', clubId);

  return {
    message:    'Cambio pendiente anulado. Nota: la suscripción en Mercado Pago ya no está activa; deberás suscribirte nuevamente al vencer el período.',
    reactivada: false,
  };
};

/**
 * Retorna la lista de planes disponibles con precios.
 */
const getPlanes = () => {
  const planes = Object.entries(PLAN_CONFIG).map(([key, cfg]) => ({
    id:                           key,
    label:                        cfg.label,
    monthly_price_usd:            cfg.monthly_price_usd,
    currency:                     cfg.currency,
    price_display:                formatPrice(cfg.monthly_price_usd),
    tax_disclaimer:               'Impuestos no incluidos',
    max_courts:                   cfg.max_courts,
    max_simultaneous_tournaments: cfg.max_simultaneous_tournaments,
    has_live_scoring:             cfg.has_live_scoring,
  }));
  return { planes };
};

/**
 * Crea un preapproval_plan en MP e inicia la suscripción.
 * @param {{ clubId: string, planType: string }} params
 */
const iniciar = async ({ clubId, planType }) => {
  if (!clubId) throw new ValidationError('No se pudo determinar el club.');

  const planPrice = PLAN_PRICES_MP[planType];
  if (!planPrice) {
    throw new ValidationError(`plan_type inválido: '${planType}'. Valores: pro, premium`);
  }

  const mpAccessToken = process.env.MP_ACCESS_TOKEN;
  if (!mpAccessToken) throw new InternalError('Configuración de pago incompleta en el servidor.');

  const { data: club, error: clubError } = await supabase
    .from('clubes')
    .select('id, nombre, slug')
    .eq('id', clubId)
    .single();

  if (clubError || !club) throw new NotFoundError('Club no encontrado.');

  const cotizacion = await fetchCotizacion();
  const monto_usd  = planPrice.amount;
  const monto_ars  = planPrice.amount_ars_override ?? Math.round(monto_usd * cotizacion);

  const webhookUrl = (process.env.MP_WEBHOOK_URL || '').trim();

  const planPayload = {
    reason: planPrice.reason,
    auto_recurring: {
      frequency:          1,
      frequency_type:     'months',
      transaction_amount: monto_ars,
      currency_id:        'ARS',
    },
    back_url:           buildBackUrl(planType, club.slug),
    external_reference: clubId,
    ...(webhookUrl && { notification_url: webhookUrl }),
  };

  const mpResponse = await fetch('https://api.mercadopago.com/preapproval_plan', {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${mpAccessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(planPayload),
  });

  if (!mpResponse.ok) {
    const mpError = await mpResponse.text();
    logger.error('Error al crear preapproval_plan en MP:', mpResponse.status, mpError);
    throw new BadGatewayError('Error al crear la suscripción en Mercado Pago.', { detail: mpError });
  }

  const mpData = await mpResponse.json();

  const { data: suscripcionData } = await supabase
    .from('suscripciones')
    .upsert(
      {
        club_id:            clubId,
        plan_id:            planType,
        preapproval_id:     mpData.id,
        status:             mpData.status ?? 'pending',
        external_reference: clubId,
      },
      { onConflict: 'club_id' },
    )
    .select('id')
    .maybeSingle();

  await supabase.from('pagos_historial').insert({
    club_id:        clubId,
    suscripcion_id: suscripcionData?.id ?? null,
    preapproval_id: mpData.id,
    monto:          monto_ars,
    monto_usd,
    cotizacion,
    currency:       'ARS',
    plan_id:        planType,
    status:         mpData.status ?? 'pending',
    descripcion:    `Inicio suscripción ${planType} — $${monto_usd} USD × ${cotizacion} = $${monto_ars} ARS`,
  });

  const planCfg = getPlanConfig(planType);
  return {
    init_point:     mpData.init_point,
    preapproval_id: mpData.id,
    status:         mpData.status,
    plan:           planType,
    price_display:  formatPrice(planCfg.monthly_price_usd),
    monto_ars,
    cotizacion,
    tax_disclaimer: 'Impuestos no incluidos',
  };
};

/**
 * Devuelve la cotización actual del dólar y precios aproximados en ARS.
 */
const getCotizacion = async () => {
  const cotizacion = await fetchCotizacion();
  return {
    cotizacion,
    fuente: cotizacion === DOLAR_FALLBACK ? 'fallback' : 'dolarapi',
    precios_ars: {
      pro:     Math.round(50 * cotizacion),
      premium: Math.round(70 * cotizacion),
    },
  };
};

module.exports = { getEstado, cancelar, anularCambioPendiente, getPlanes, iniciar, getCotizacion };
