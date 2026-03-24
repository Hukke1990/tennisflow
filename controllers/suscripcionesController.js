const supabase = require('../services/supabase');
const { getPlanConfig, formatPrice, CURRENCY } = require('../services/planConfig');

// ── Helpers ───────────────────────────────────────────────────────────────────

const resolveClubId = (req) => {
  const fromParams = req.params?.clubId;
  const fromQuery  = req.query?.club_id;       // enviado por el interceptor de axios
  const fromUser   = req.authUser?.club_id;    // fijado por requireAuth middleware
  return fromParams || fromUser || fromQuery || null;
};

const DOLAR_FALLBACK = 1200; // tasa de emergencia si la API falla

/**
 * Obtiene la cotización del dólar oficial (venta) desde dolarapi.com.
 * Si falla, devuelve el valor de fallback.
 */
const fetchCotizacion = async () => {
  try {
    const resp = await fetch('https://dolarapi.com/v1/dolares/oficial', {
      signal: AbortSignal.timeout(3000),
    });
    if (!resp.ok) throw new Error(`dolarapi status ${resp.status}`);
    const d = await resp.json();
    const rate = Number(d?.venta);
    return Number.isFinite(rate) && rate > 0 ? rate : DOLAR_FALLBACK;
  } catch {
    return DOLAR_FALLBACK;
  }
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
      .select('id, plan_id, status, next_payment_date, payer_email, pending_plan_id, created_at, updated_at')
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
      pending_plan_id: data.pending_plan_id ?? null,
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

    // Intentar cancelar con el preapproval_id guardado.
    // Si falla (ej: el ID es un template y no una instancia), buscar la suscripción
    // real por external_reference y cancelar esa.
    let realPreapprovalId = suscripcion.preapproval_id;

    const tryCancel = async (preapprovalId) => {
      return fetch(
        `https://api.mercadopago.com/preapproval/${preapprovalId}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${mpAccessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ status: 'cancelled' }),
        },
      );
    };

    let mpResponse = await tryCancel(realPreapprovalId);

    // Si falla, buscar la instancia real por external_reference
    if (!mpResponse.ok) {
      console.warn(`[cancelar] preapproval_id ${realPreapprovalId} falló (${mpResponse.status}). Buscando por external_reference…`);
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
        console.error('[cancelar] Error buscando suscripción en MP:', searchErr.message);
      }
    }

    if (!mpResponse.ok) {
      const mpError = await mpResponse.text();
      console.error('Error al cancelar en MP:', mpResponse.status, mpError);
      return res.status(502).json({
        error: 'No se pudo cancelar la suscripción en Mercado Pago.',
        detail: mpError,
      });
    }

    // Cancelar en MP fue exitoso.
    // NO degradamos el plan inmediatamente: el usuario ya pagó el periodo actual.
    // Guardamos pending_plan_id='basico' y dejamos clubes.plan intacto.
    // El cron (apply_expired_plan_changes) degradará cuando venza next_payment_date.
    await supabase
      .from('suscripciones')
      .update({
        status:              'cancelled',
        plan_id:             'basico',
        preapproval_id:      realPreapprovalId,
        pending_plan_id: 'basico',
      })
      .eq('club_id', clubId);

    return res.status(200).json({
      message: 'Suscripción cancelada. Seguirás con tu plan actual hasta que venza el período pagado.',
      pending_plan_id: 'basico',
    });
  } catch (err) {
    console.error('Error inesperado en cancelar:', err);
    return res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

/**
 * POST /api/suscripciones/anular-cambio-pendiente
 *
 * Cancela un cambio de plan pendiente.
 * Si la suscripción en MP estaba cancelada, intenta reactivarla.
 */
const anularCambioPendiente = async (req, res) => {
  try {
    const clubId = resolveClubId(req);
    if (!clubId) return res.status(400).json({ error: 'No se pudo determinar el club.' });

    const { data: suscripcion, error: fetchError } = await supabase
      .from('suscripciones')
      .select('id, status, preapproval_id, plan_id, pending_plan_id')
      .eq('club_id', clubId)
      .maybeSingle();

    if (fetchError || !suscripcion) {
      return res.status(404).json({ error: 'No hay suscripción registrada.' });
    }

    if (!suscripcion.pending_plan_id) {
      return res.status(409).json({ error: 'No hay ningún cambio pendiente para anular.' });
    }

    const mpAccessToken = process.env.MP_ACCESS_TOKEN;

    // Si la suscripción está cancelada en MP, intentar reactivarla
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
          // Reactivación exitosa en MP → restaurar estado
          await Promise.all([
            supabase.from('suscripciones').update({ status: 'authorized', pending_plan_id: null }).eq('club_id', clubId),
            supabase.from('clubes').update({ plan: suscripcion.plan_id }).eq('id', clubId),
          ]);
          return res.status(200).json({ message: 'Cambio pendiente anulado. Tu suscripción sigue activa.', reactivada: true });
        }
        // MP no permite reactivar (ej: suscripción muy antigua) → solo limpiar pending
        console.warn('[anularCambioPendiente] MP no permitió reactivar:', await mpRes.text());
      } catch (err) {
        console.error('[anularCambioPendiente] Error al reactivar en MP:', err.message);
      }
    }

    // Solo limpiar el pending_plan_id (sin reactivar MP)
    await supabase.from('suscripciones').update({ pending_plan_id: null }).eq('club_id', clubId);

    return res.status(200).json({
      message: 'Cambio pendiente anulado. Nota: la suscripción en Mercado Pago ya no está activa; deberás suscribirte nuevamente al vencer el período.',
      reactivada: false,
    });
  } catch (err) {
    console.error('Error inesperado en anularCambioPendiente:', err);
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
  pro:     { amount: 50, reason: 'SetGo Pro — Suscripción mensual' },
  premium: { amount: 70, reason: 'SetGo Grand Slam — Suscripción mensual' },
  // ⚠️  Plan temporal de pruebas — 15 ARS (mínimo aceptado por MP)
  test:    { amount: 0,  reason: 'SetGo Test — Plan de prueba', amount_ars_override: 15 },
};

/**
 * Construye el back_url para Mercado Pago.
 * MP rechaza URLs con localhost, por lo que se usa MP_BACK_URL si está definido.
 * En producción, APP_URL es HTTPS y se usa directamente.
 */
const buildBackUrl = (plan_type, slug) => {
  const appUrl     = (process.env.APP_URL || '').trim();
  const backBase   = (process.env.MP_BACK_URL || appUrl).trim();
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

    // Cotización del dólar oficial y cálculo en ARS
    const cotizacion = await fetchCotizacion();
    const monto_usd  = planPrice.amount;
    const monto_ars  = planPrice.amount_ars_override ?? Math.round(monto_usd * cotizacion);

    const webhookUrl = (process.env.MP_WEBHOOK_URL || '').trim();

    // Usar preapproval_plan: no requiere payer_email (el pagador lo ingresa en el checkout).
    // Es el flujo correcto para suscripciones donde el admin compra para su propia cuenta.
    const planPayload = {
      reason: planPrice.reason,
      auto_recurring: {
        frequency:           1,
        frequency_type:      'months',
        transaction_amount:  monto_ars,
        currency_id:         'ARS',
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
    const { data: suscripcionData } = await supabase
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
      )
      .select('id')
      .maybeSingle();

    // Registrar en historial de pagos con cotización aplicada
    await supabase.from('pagos_historial').insert({
      club_id:        clubId,
      suscripcion_id: suscripcionData?.id ?? null,
      preapproval_id: mpData.id,
      monto:          monto_ars,
      monto_usd,
      cotizacion,
      currency:       'ARS',
      plan_id:        plan_type,
      status:         mpData.status ?? 'pending',
      descripcion:    `Inicio suscripción ${plan_type} — $${monto_usd} USD × ${cotizacion} = $${monto_ars} ARS`,
    });

    const planCfg = getPlanConfig(plan_type);
    return res.status(200).json({
      init_point:     mpData.init_point,
      preapproval_id: mpData.id,
      status:         mpData.status,
      plan:           plan_type,
      price_display:  formatPrice(planCfg.monthly_price_usd),
      monto_ars,
      cotizacion,
      tax_disclaimer: 'Impuestos no incluidos',
    });
  } catch (err) {
    console.error('Error inesperado en iniciar:', err);
    return res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

/**
 * GET /api/suscripciones/cotizacion
 *
 * Devuelve la cotización actual del dólar oficial y los precios aproximados
 * en ARS para cada plan. Público (sin auth requerida).
 */
const getCotizacion = async (_req, res) => {
  const cotizacion = await fetchCotizacion();
  return res.status(200).json({
    cotizacion,
    fuente: cotizacion === DOLAR_FALLBACK ? 'fallback' : 'dolarapi',
    precios_ars: {
      pro:     Math.round(50 * cotizacion),
      premium: Math.round(70 * cotizacion),
    },
  });
};

module.exports = { getEstado, cancelar, anularCambioPendiente, getPlanes, iniciar, getCotizacion };
