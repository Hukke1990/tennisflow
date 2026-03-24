const supabase = require('../services/supabase');
const { getPlanConfig, formatPrice, CURRENCY } = require('../services/planConfig');

// ── Helpers ───────────────────────────────────────────────────────────────────

const resolveClubId = (req) => {
  const fromParams = req.params?.clubId;
  const fromQuery  = req.query?.club_id;       // enviado por el interceptor de axios
  const fromUser   = req.authUser?.club_id;    // fijado por requireAuth middleware
  return fromParams || fromUser || fromQuery || null;
};

// ── Controladores ─────────────────────────────────────────────────────────────

/**
 * GET /api/suscripciones/estado
 *
 * Devuelve el estado actual de la suscripción del club autenticado.
 * Si no tiene suscripción registrada, devuelve plan 'basico' (gratis).
 */
const getEstado = async (req, res) => {
  try {
    const clubId = resolveClubId(req);
    if (!clubId) {
      return res.status(400).json({ error: 'No se pudo determinar el club.' });
    }

    const { data, error } = await supabase
      .from('suscripciones')
      .select('id, plan_id, status, next_payment_date, payer_email, created_at, updated_at')
      .eq('club_id', clubId)
      .maybeSingle();

    if (error) {
      console.error('Error al obtener suscripción:', error);
      return res.status(500).json({ error: 'No se pudo obtener el estado de la suscripción.' });
    }

    // Sin suscripción → plan básico
    if (!data) {
      const planCfg = getPlanConfig('basico');
      return res.status(200).json({
        suscripcion: null,
        plan: 'basico',
        plan_label: planCfg.label,
        monthly_price_usd: planCfg.monthly_price_usd,
        currency: CURRENCY,
        price_display: formatPrice(planCfg.monthly_price_usd),
        tax_disclaimer: 'Impuestos no incluidos',
        activa: false,
      });
    }

    const planCfg = getPlanConfig(data.plan_id);
    const activa  = data.status === 'authorized';

    return res.status(200).json({
      suscripcion: data,
      plan: data.plan_id,
      plan_label: planCfg.label,
      monthly_price_usd: planCfg.monthly_price_usd,
      currency: CURRENCY,
      price_display: formatPrice(planCfg.monthly_price_usd),
      tax_disclaimer: 'Impuestos no incluidos',
      activa,
    });
  } catch (err) {
    console.error('Error inesperado en getEstado:', err);
    return res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

/**
 * POST /api/suscripciones/cancelar
 *
 * Cancela la suscripción activa del club autenticado.
 * Llama a la API de Mercado Pago para markar el preapproval como 'cancelled'
 * y actualiza la tabla suscripciones + el plan del club.
 */
const cancelar = async (req, res) => {
  try {
    const clubId = resolveClubId(req);
    if (!clubId) {
      return res.status(400).json({ error: 'No se pudo determinar el club.' });
    }

    // Obtener suscripción actual
    const { data: suscripcion, error: fetchError } = await supabase
      .from('suscripciones')
      .select('id, preapproval_id, status')
      .eq('club_id', clubId)
      .maybeSingle();

    if (fetchError) {
      console.error('Error al obtener suscripción para cancelar:', fetchError);
      return res.status(500).json({ error: 'Error al obtener la suscripción.' });
    }

    if (!suscripcion || !suscripcion.preapproval_id) {
      return res.status(404).json({ error: 'No hay suscripción activa para cancelar.' });
    }

    if (suscripcion.status === 'cancelled') {
      return res.status(409).json({ error: 'La suscripción ya está cancelada.' });
    }

    // Cancelar en Mercado Pago
    const mpAccessToken = process.env.MP_ACCESS_TOKEN;
    if (!mpAccessToken) {
      return res.status(500).json({ error: 'Configuración de pago incompleta en el servidor.' });
    }

    const mpResponse = await fetch(
      `https://api.mercadopago.com/preapproval/${suscripcion.preapproval_id}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${mpAccessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'cancelled' }),
      },
    );

    if (!mpResponse.ok) {
      const mpError = await mpResponse.text();
      console.error('Error al cancelar en MP:', mpResponse.status, mpError);
      return res.status(502).json({
        error: 'No se pudo cancelar la suscripción en Mercado Pago.',
        detail: mpError,
      });
    }

    // Actualizar DB: suscripcion → cancelled, club → basico
    await Promise.all([
      supabase
        .from('suscripciones')
        .update({ status: 'cancelled' })
        .eq('club_id', clubId),
      supabase
        .from('clubes')
        .update({ plan: 'basico' })
        .eq('id', clubId),
    ]);

    return res.status(200).json({
      message: 'Suscripción cancelada correctamente. El club volvió al plan Básico.',
      plan: 'basico',
    });
  } catch (err) {
    console.error('Error inesperado en cancelar:', err);
    return res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

/**
 * GET /api/suscripciones/planes
 *
 * Devuelve la lista de planes disponibles con precio e info (público).
 * Útil para renderizar la grilla de planes en el frontend.
 */
const getPlanes = (_req, res) => {
  const { PLAN_CONFIG } = require('../services/planConfig');

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

  return res.status(200).json({ planes });
};

/**
 * POST /api/suscripciones/iniciar
 *
 * Crea un preapproval en Mercado Pago y redirige al titular del club.
 * Body: { plan_type: 'pro' | 'premium' }
 * El club y el email se resuelven desde el usuario autenticado.
 */
const PLAN_PRICES_MP = {
  pro:     { amount: 50, reason: 'TennisFlow Pro — Suscripción mensual' },
  premium: { amount: 70, reason: 'TennisFlow Grand Slam — Suscripción mensual' },
};

/**
 * Construye el back_url para Mercado Pago.
 * MP rechaza URLs con localhost, por lo que se usa MP_BACK_URL si está definido.
 * En producción, APP_URL es HTTPS y se usa directamente.
 */
const buildBackUrl = (plan_type, slug) => {
  const appUrl     = process.env.APP_URL || '';
  const backBase   = process.env.MP_BACK_URL || appUrl;
  const isLocalhost = backBase.includes('localhost') || backBase.includes('127.0.0.1');
  if (isLocalhost) {
    // Fallback: página neutra de MP (el admin verá la confirmación en el panel de MP)
    return 'https://www.mercadopago.com.ar/subscriptions';
  }
  return `${backBase}/suscripcion/exito?plan=${plan_type}&slug=${slug}`;
};

const iniciar = async (req, res) => {
  try {
    const clubId = resolveClubId(req);

    if (!clubId) {
      return res.status(400).json({ error: 'No se pudo determinar el club.' });
    }

    const plan_type = String(req.body?.plan_type || '').trim().toLowerCase();
    const planPrice = PLAN_PRICES_MP[plan_type];
    if (!planPrice) {
      return res.status(400).json({ error: `plan_type inválido: '${plan_type}'. Valores: pro, premium` });
    }

    const mpAccessToken = process.env.MP_ACCESS_TOKEN;
    if (!mpAccessToken) {
      return res.status(500).json({ error: 'Configuración de pago incompleta en el servidor.' });
    }

    // Obtener slug del club para el back_url y la referencia externa
    const { data: club, error: clubError } = await supabase
      .from('clubes')
      .select('id, nombre, slug')
      .eq('id', clubId)
      .single();

    if (clubError || !club) {
      return res.status(404).json({ error: 'Club no encontrado.' });
    }

    const webhookUrl = process.env.MP_WEBHOOK_URL || '';

    // Usar preapproval_plan: no requiere payer_email (el pagador lo ingresa en el checkout).
    // Es el flujo correcto para suscripciones donde el admin compra para su propia cuenta.
    const planPayload = {
      reason: planPrice.reason,
      auto_recurring: {
        frequency:           1,
        frequency_type:      'months',
        transaction_amount:  planPrice.amount,
        currency_id:         process.env.MP_CURRENCY_ID || 'ARS',
      },
      back_url:          buildBackUrl(plan_type, club.slug),
      external_reference: clubId,
      ...(webhookUrl && { notification_url: webhookUrl }),
    };

    const mpResponse = await fetch('https://api.mercadopago.com/preapproval_plan', {
      method: 'POST',
      headers: {
        Authorization:  `Bearer ${mpAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(planPayload),
    });

    if (!mpResponse.ok) {
      const mpError = await mpResponse.text();
      console.error('Error al crear preapproval_plan en MP:', mpResponse.status, mpError);
      return res.status(502).json({ error: 'Error al crear la suscripción en Mercado Pago.', detail: mpError });
    }

    const mpData = await mpResponse.json();

    // Persistir plan pendiente (el status se actualizará vía webhook cuando el pago se confirme)
    await supabase
      .from('suscripciones')
      .upsert(
        {
          club_id:            clubId,
          plan_id:            plan_type,
          preapproval_id:     mpData.id,
          status:             mpData.status ?? 'pending',
          external_reference: clubId,
        },
        { onConflict: 'club_id' },
      );

    const planCfg = getPlanConfig(plan_type);
    return res.status(200).json({
      init_point:     mpData.init_point,
      preapproval_id: mpData.id,
      status:         mpData.status,
      plan:           plan_type,
      price_display:  formatPrice(planCfg.monthly_price_usd),
      tax_disclaimer: 'Impuestos no incluidos',
    });
  } catch (err) {
    console.error('Error inesperado en iniciar:', err);
    return res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

module.exports = { getEstado, cancelar, getPlanes, iniciar };
