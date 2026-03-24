// supabase/functions/webhook-suscripcion/index.ts
//
// Edge Function: receptor de notificaciones IPN de Mercado Pago.
// MP llama a esta URL cuando el estado de un preapproval cambia
// (p. ej.: authorized, paused, cancelled), o cuando se genera un
// cobro individual (topic: "payment").
//
// Formatos de notificación compatibles:
//   • IPN clásico: POST con body { id, topic }
//   • Notifications v2: POST con body { data: { id }, type }
//
// Variables de entorno requeridas:
//   MP_ACCESS_TOKEN          → Access token de MP (para consultar el preapproval)
//   MP_CURRENCY_ID           → (Opcional) Moneda usada. Default: 'USD'
//   SUPABASE_URL             → Inyectada automáticamente por Supabase
//   SUPABASE_SERVICE_ROLE_KEY → Inyectada automáticamente por Supabase
//   MP_WEBHOOK_SECRET        → (Opcional) HMAC secret para validar firma de MP

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Mapa de estados MP → estados internos
const STATUS_MAP: Record<string, string> = {
  authorized: "authorized",
  paused:     "paused",
  cancelled:  "cancelled",
  pending:    "pending",
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Método no permitido" }, 405);
  }

  const MP_ACCESS_TOKEN = Deno.env.get("MP_ACCESS_TOKEN");
  if (!MP_ACCESS_TOKEN) {
    console.error("MP_ACCESS_TOKEN no configurado");
    return jsonResponse({ error: "Configuración incompleta" }, 500);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const mpCurrencyId = Deno.env.get("MP_CURRENCY_ID") ?? "USD";

  // ── 1. Parsear body de la notificación ────────────────────────────────────
  let preapprovalId: string | null = null;
  let paymentId: string | null = null;
  let notificationType = "preapproval";

  try {
    const body = await req.json();

    // Formato v2: { type: "subscription_preapproval", data: { id: "..." } }
    if (body?.type === "subscription_preapproval" && body?.data?.id) {
      preapprovalId = String(body.data.id);
    }
    // Formato v2: cobro individual de suscripción
    else if (body?.type === "subscription_authorized_payment" && body?.data?.id) {
      paymentId = String(body.data.id);
      notificationType = "payment";
    }
    // IPN clásico: { topic: "preapproval", id: "..." }
    else if (body?.topic === "preapproval" && body?.id) {
      preapprovalId = String(body.id);
    }
    // IPN clásico: cobro
    else if (body?.topic === "payment" && body?.id) {
      paymentId = String(body.id);
      notificationType = "payment";
    }
    // Notificación en query string (MP a veces lo envía así)
    else {
      const url = new URL(req.url);
      const topicQS = url.searchParams.get("topic");
      const idQS = url.searchParams.get("id");
      if (topicQS === "preapproval" && idQS) preapprovalId = idQS;
      if (topicQS === "payment" && idQS) { paymentId = idQS; notificationType = "payment"; }
    }
  } catch {
    const url = new URL(req.url);
    preapprovalId = url.searchParams.get("id");
  }

  if (!preapprovalId && !paymentId) {
    return jsonResponse({ received: true });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // ── Rama: notificación de cobro individual ─────────────────────────────────
  if (notificationType === "payment" && paymentId) {
    const pmResponse = await fetch(
      `https://api.mercadopago.com/v1/payments/${paymentId}`,
      { headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` } },
    );

    if (!pmResponse.ok) {
      console.error("Error al consultar pago MP:", pmResponse.status);
      return jsonResponse({ received: true, warning: "No se pudo obtener el pago" });
    }

    const pmData = await pmResponse.json();
    const clubId = pmData.external_reference ?? null;

    // Buscar la suscripción vinculada al preapproval del pago
    let suscripcionId: string | null = null;
    if (pmData.preapproval_id) {
      const { data: sub } = await supabase
        .from("suscripciones")
        .select("id, plan_id")
        .eq("preapproval_id", pmData.preapproval_id)
        .maybeSingle();
      suscripcionId = sub?.id ?? null;
    }

    // Insertar en pagos_historial (ON CONFLICT en payment_id para idempotencia)
    const { error: insertError } = await supabase
      .from("pagos_historial")
      .upsert(
        {
          club_id:       clubId,
          suscripcion_id: suscripcionId,
          preapproval_id: pmData.preapproval_id ?? null,
          payment_id:    paymentId,
          monto:         pmData.transaction_amount ?? 0,
          currency:      pmData.currency_id ?? mpCurrencyId,
          plan_id:       pmData.description?.includes("Pro") ? "pro"
                         : pmData.description?.includes("Grand Slam") ? "premium"
                         : "basico",
          status:        pmData.status === "approved" ? "approved"
                         : pmData.status === "rejected" ? "rejected" : "pending",
          fecha_pago:    pmData.date_approved ?? pmData.date_created ?? null,
          descripcion:   pmData.description ?? null,
          payer_email:   pmData.payer?.email ?? null,
        },
        { onConflict: "payment_id" },
      );

    if (insertError) {
      console.error("Error al insertar pago en historial:", insertError);
    } else {
      console.log(`Pago ${paymentId} registrado en historial → ${pmData.status}`);
    }

    return jsonResponse({ received: true, payment_id: paymentId, status: pmData.status });
  }

  // ── Rama: notificación de cambio de estado del preapproval ─────────────────
  if (!preapprovalId) return jsonResponse({ received: true });

  // ── 2. Consultar el estado actual del preapproval en MP ───────────────────
  const mpResponse = await fetch(
    `https://api.mercadopago.com/preapproval/${preapprovalId}`,
    {
      headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
    },
  );

  if (!mpResponse.ok) {
    console.error("Error al consultar preapproval MP:", mpResponse.status);
    // Responder 200 para que MP no reintente indefinidamente
    return jsonResponse({ received: true, warning: "No se pudo obtener el preapproval" });
  }

  const mpData = await mpResponse.json();
  const newStatus = STATUS_MAP[mpData.status] ?? "pending";

  // Calcular próxima fecha de cobro
  const nextPaymentDate: string | null =
    mpData.summarized?.next_payment_date ??
    mpData.next_payment_date ??
    null;

  // ── 3. Actualizar tabla suscripciones ─────────────────────────────────────

  const updatePayload: Record<string, unknown> = {
    status: newStatus,
    next_payment_date: nextPaymentDate,
  };

  // Si el plan_id cambió (upgrade/downgrade desde el portal de MP)
  // el external_reference lleva el club_id — no el plan, así que no tocamos plan_id aquí.
  // Si MP devuelve un payer_email actualizado, sincronizarlo.
  if (mpData.payer_email) {
    updatePayload.payer_email = mpData.payer_email;
  }

  const { error: updateError } = await supabase
    .from("suscripciones")
    .update(updatePayload)
    .eq("preapproval_id", preapprovalId);

  if (updateError) {
    console.error("Error al actualizar suscripción en DB:", updateError);
  } else {
    console.log(`Suscripción ${preapprovalId} actualizada → ${newStatus}`);

    // Si fue autorizada → sincronizar plan + registrar primer pago en historial
    if (newStatus === "authorized" && mpData.external_reference) {
      const planFromSub = await supabase
        .from("suscripciones")
        .select("id, plan_id")
        .eq("preapproval_id", preapprovalId)
        .single();

      if (!planFromSub.error && planFromSub.data?.plan_id) {
        const planMap: Record<string, string> = { pro: "pro", premium: "premium", basico: "basico" };
        const newPlan = planMap[planFromSub.data.plan_id];
        if (newPlan) {
          await supabase
            .from("clubes")
            .update({ plan: newPlan })
            .eq("id", mpData.external_reference);
        }

        // Registrar autorización inicial en historial
        const planAmounts: Record<string, number> = { basico: 30, pro: 50, premium: 70 };
        const planAmount = planAmounts[planFromSub.data.plan_id] ?? 0;

        await supabase.from("pagos_historial").insert({
          club_id:       mpData.external_reference,
          suscripcion_id: planFromSub.data.id,
          preapproval_id: preapprovalId,
          payment_id:    null,             // no hay pago individual aún
          monto:         planAmount,
          currency:      mpCurrencyId,
          plan_id:       planFromSub.data.plan_id,
          status:        "approved",
          fecha_pago:    new Date().toISOString(),
          descripcion:   mpData.reason ?? null,
          payer_email:   mpData.payer_email ?? null,
        });
      }
    }

    // Si fue cancelada → degradar a básico
    if (newStatus === "cancelled" && mpData.external_reference) {
      await supabase
        .from("clubes")
        .update({ plan: "basico" })
        .eq("id", mpData.external_reference);
    }
  }

  // MP requiere siempre una respuesta 200 para confirmar recepción
  return jsonResponse({ received: true, status: newStatus });
});
