/**
 * controllers/activarController.js
 *
 * Flujo público de activación de club:
 *   GET  /api/activar/:clubId         → datos del club para mostrar en la página
 *   POST /api/activar/:clubId/pagar   → inicia pago en MP, devuelve init_point
 *
 * No requiere autenticación: el cliente aún no tiene sesión.
 */

const supabase = require('../services/supabase');
const { getPlanConfig, formatPrice } = require('../services/planConfig');

const PLAN_PRICES_ACTIVACION = {
  basico:  { amount: 30, reason: 'SetGo Básico — Suscripción mensual' },
  pro:     { amount: 50, reason: 'SetGo Pro — Suscripción mensual' },
  premium: { amount: 70, reason: 'SetGo Grand Slam — Suscripción mensual' },
  // ⚠️  Plan temporal de pruebas — 1 ARS fijo
  test:    { amount: 0,  reason: 'SetGo Test — Plan de prueba', amount_ars_override: 1 },
};

const DOLAR_FALLBACK = 1200;

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

// ── GET /api/activar/:clubId ──────────────────────────────────────────────────

const getClubParaActivar = async (req, res) => {
  try {
    const clubId = String(req.params?.clubId || '').trim();
    if (!clubId) return res.status(400).json({ error: 'Club ID requerido.' });

    const { data: club, error } = await supabase
      .from('clubes')
      .select('id, nombre, slug, is_active, plan')
      .eq('id', clubId)
      .maybeSingle();

    if (error) {
      console.error('[activar] Error al obtener club:', error);
      return res.status(500).json({ error: 'Error al obtener el club.' });
    }
    if (!club) return res.status(404).json({ error: 'Club no encontrado.' });

    return res.json({
      id:        club.id,
      nombre:    club.nombre,
      slug:      club.slug,
      is_active: club.is_active ?? false,
      plan:      club.plan,
    });
  } catch (err) {
    console.error('[activar] Error inesperado:', err);
    return res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

// ── POST /api/activar/:clubId/pagar ───────────────────────────────────────────

const iniciarPago = async (req, res) => {
  try {
    const clubId  = String(req.params?.clubId || '').trim();
    const planType = String(req.body?.plan_type || '').trim().toLowerCase();

    if (!clubId) return res.status(400).json({ error: 'Club ID requerido.' });

    if (!PLAN_PRICES_ACTIVACION[planType]) {
      return res.status(400).json({ error: 'plan_type inválido. Valores aceptados: basico, pro, premium.' });
    }

    const { data: club, error: clubError } = await supabase
      .from('clubes')
      .select('id, nombre, slug, is_active')
      .eq('id', clubId)
      .maybeSingle();

    if (clubError || !club) {
      return res.status(404).json({ error: 'Club no encontrado.' });
    }

    if (club.is_active) {
      return res.status(409).json({
        error: 'Este club ya está activo. Usá el panel de suscripciones para cambiar tu plan.',
      });
    }

    const mpAccessToken = process.env.MP_ACCESS_TOKEN;
    if (!mpAccessToken) {
      return res.status(500).json({ error: 'Configuración de pago incompleta en el servidor.' });
    }

    const cotizacion  = await fetchCotizacion();
    const { amount, reason, amount_ars_override } = PLAN_PRICES_ACTIVACION[planType];
    const monto_ars   = amount_ars_override ?? Math.round(amount * cotizacion);

    const appUrl    = (process.env.APP_URL || 'https://setgo-app.vercel.app').trim();
    const backBase  = (process.env.MP_BACK_URL || appUrl).trim();
    const isLocalhost = backBase.includes('localhost') || backBase.includes('127.0.0.1');
    const backUrl   = isLocalhost
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
      body: JSON.stringify(mpPayload),
    });

    if (!mpResponse.ok) {
      const mpError = await mpResponse.text();
      console.error('[activar] Error al crear preapproval_plan en MP:', mpResponse.status, mpError);
      return res.status(502).json({
        error:  'No se pudo iniciar el pago con Mercado Pago.',
        detail: mpError,
      });
    }

    const mpData      = await mpResponse.json();
    const init_point  = mpData?.init_point;
    const preapprovalId = mpData?.id;

    if (!init_point) {
      return res.status(502).json({ error: 'Mercado Pago no devolvió URL de pago.' });
    }

    // Guardar suscripción en estado pending — será confirmada por el webhook
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

    return res.json({
      init_point,
      plan:          planType,
      plan_label:    planCfg.label,
      price_usd:     amount,
      price_display: formatPrice(amount),
      monto_ars,
      cotizacion,
    });
  } catch (err) {
    console.error('[activar] Error inesperado en iniciarPago:', err);
    return res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

module.exports = { getClubParaActivar, iniciarPago };
