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
  // ⚠️  Plan temporal de pruebas — 15 ARS (mínimo aceptado por MP)
  test:    { amount: 0,  reason: 'SetGo Test — Plan de prueba', amount_ars_override: 15 },
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

// ── GET /api/activar/:clubId/verificar ─────────────────────────────────────
// Consulta MP directamente y activa el club si el preapproval está authorized.
// El frontend lo llama en polling al volver de la página de pago.

const verificarPago = async (req, res) => {
  try {
    const clubId = String(req.params?.clubId || '').trim();
    if (!clubId) return res.status(400).json({ error: 'Club ID requerido.' });

    const mpToken = process.env.MP_ACCESS_TOKEN;
    if (!mpToken) return res.status(500).json({ error: 'Configuración incompleta.' });

    // Primero verificar si el club ya fue activado (ej. por webhook) antes de consultar MP
    const { data: clubEarly } = await supabase
      .from('clubes')
      .select('is_active, plan, slug')
      .eq('id', clubId)
      .maybeSingle();

    if (clubEarly?.is_active) {
      return res.json({ is_active: true, plan: clubEarly.plan, slug: clubEarly.slug });
    }

    // Obtener el preapproval_id guardado en suscripciones para este club
    const { data: sub } = await supabase
      .from('suscripciones')
      .select('preapproval_id, plan_id, status')
      .eq('club_id', clubId)
      .maybeSingle();

    if (!sub?.preapproval_id) {
      return res.json({ is_active: false, reason: 'sin_suscripcion' });
    }

    // Consultar MP: primero intentar como preapproval (suscripción), luego como plan template
    let mpStatus = null;
    let resolvedPlanId = sub.plan_id ?? 'basico';

    // Buscar suscripción activa vinculada al template (el ID que guardamos es el del plan)
    try {
      // Buscar preapprovals activos cuyo preapproval_plan_id sea nuestro template
      const searchRes = await fetch(
        `https://api.mercadopago.com/preapproval/search?preapproval_plan_id=${sub.preapproval_id}&external_reference=${clubId}`,
        { headers: { Authorization: `Bearer ${mpToken}` } },
      );
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        const instances = searchData?.results ?? [];
        const authorized = instances.find((i) => i.status === 'authorized');
        if (authorized) {
          mpStatus = 'authorized';
          resolvedPlanId = sub.plan_id ?? 'basico';
        } else if (instances.length > 0) {
          mpStatus = instances[0].status;
        }
      }
    } catch (_) { /* ignorar */ }

    // Fallback: buscar sin external_reference (MP no siempre lo propaga del plan-template)
    if (!mpStatus) {
      try {
        const searchRes2 = await fetch(
          `https://api.mercadopago.com/preapproval/search?preapproval_plan_id=${sub.preapproval_id}`,
          { headers: { Authorization: `Bearer ${mpToken}` } },
        );
        if (searchRes2.ok) {
          const searchData2 = await searchRes2.json();
          const instances2 = searchData2?.results ?? [];
          const authorized2 = instances2.find((i) => i.status === 'authorized');
          if (authorized2) {
            mpStatus = 'authorized';
            resolvedPlanId = sub.plan_id ?? 'basico';
          } else if (instances2.length > 0) {
            mpStatus = instances2[0].status;
          }
        }
      } catch (_) { /* ignorar */ }
    }

    // Fallback: consultar el template directamente
    if (!mpStatus) {
      try {
        const planRes = await fetch(
          `https://api.mercadopago.com/preapproval_plan/${sub.preapproval_id}`,
          { headers: { Authorization: `Bearer ${mpToken}` } },
        );
        if (planRes.ok) {
          const planData = await planRes.json();
          // El plan en sí no tiene status de "pagado", buscar si tiene suscripciones
          // Si llegamos aquí sin encontrar instancia, el pago aún no procesó
          mpStatus = planData?.status ?? null;
        }
      } catch (_) { /* ignorar */ }
    }

    // Si encontramos una instancia autorizada → activar el club
    if (mpStatus === 'authorized') {
      const { PLAN_MAP } = { PLAN_MAP: { basico:'basico', pro:'pro', premium:'premium', test:'test' } };
      const targetPlan = PLAN_MAP[resolvedPlanId] ?? 'basico';

      await Promise.all([
        supabase.from('clubes').update({ is_active: true, plan: targetPlan }).eq('id', clubId),
        supabase.from('suscripciones').update({ status: 'authorized' }).eq('club_id', clubId),
      ]);

      const { data: club } = await supabase
        .from('clubes')
        .select('slug')
        .eq('id', clubId)
        .maybeSingle();

      return res.json({ is_active: true, plan: targetPlan, slug: club?.slug ?? null });
    }

    // Verificar si el club ya fue activado por el webhook antes de que llegáramos
    const { data: club } = await supabase
      .from('clubes')
      .select('is_active, plan, slug')
      .eq('id', clubId)
      .maybeSingle();

    if (club?.is_active) {
      return res.json({ is_active: true, plan: club.plan, slug: club.slug });
    }

    return res.json({ is_active: false, mp_status: mpStatus, reason: 'pendiente' });
  } catch (err) {
    console.error('[activar] Error en verificarPago:', err);
    return res.status(500).json({ error: 'Error interno.' });
  }
};

module.exports = { getClubParaActivar, iniciarPago, verificarPago };
