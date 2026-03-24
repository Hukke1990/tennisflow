// supabase/functions/crear-suscripcion/index.ts
//
// Edge Function: genera un preapproval de Mercado Pago y lo persiste
// en la tabla `suscripciones`. Devuelve el `init_point` para redirigir
// al titular del club a la página de alta de tarjeta en MP.
//
// Variables de entorno requeridas (configurar en Supabase Dashboard):
//   MP_ACCESS_TOKEN          → Access token de producción o sandbox de MP
//   SUPABASE_URL             → URL del proyecto Supabase (inyectada automáticamente)
//   SUPABASE_SERVICE_ROLE_KEY → Service role key (inyectada automáticamente)
//   APP_URL                  → URL pública del frontend (ej: https://tennisflow.vercel.app)
//   MP_CURRENCY_ID           → (Opcional) Moneda para el cobro en MP.
//                              Default: 'USD'. Usar 'ARS' si la cuenta MP
//                              es argentina y no admite cargos directos en USD.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Configuración de planes ───────────────────────────────────────────────────
// Precios en USD. Sincronizar con services/planConfig.js del backend Express.
// Impuestos NO incluidos — se aplican según la jurisdicción del pagador.
const PLAN_PRICES: Record<string, { amount: number; reason: string }> = {
  basico: {
    amount: 30,
    reason: "TennisFlow Básico — Suscripción mensual",
  },
  pro: {
    amount: 50,
    reason: "TennisFlow Pro — Suscripción mensual",
  },
  premium: {
    amount: 70,
    reason: "TennisFlow Grand Slam — Suscripción mensual",
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// ── Handler principal ─────────────────────────────────────────────────────────
serve(async (req: Request) => {
  // Preflight CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Método no permitido" }, 405);
  }

  const MP_ACCESS_TOKEN = Deno.env.get("MP_ACCESS_TOKEN");
  if (!MP_ACCESS_TOKEN) {
    console.error("MP_ACCESS_TOKEN no configurado");
    return jsonResponse({ error: "Configuración incompleta del servidor" }, 500);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const APP_URL = Deno.env.get("APP_URL") ?? "https://tennisflow.vercel.app";

  // URL pública de la Edge Function de webhook (para que MP notifique cambios)
  const WEBHOOK_URL = `${SUPABASE_URL.replace("supabase.co", "supabase.co")}/functions/v1/webhook-suscripcion`;

  // ── 1. Parsear y validar body ───────────────────────────────────────────────
  let club_id: string;
  let plan_type: string;

  try {
    const body = await req.json();
    club_id = String(body?.club_id ?? "").trim();
    plan_type = String(body?.plan_type ?? "").trim().toLowerCase();
  } catch {
    return jsonResponse({ error: "Body inválido — se esperaba JSON" }, 400);
  }

  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_REGEX.test(club_id)) {
    return jsonResponse({ error: "club_id inválido" }, 400);
  }

  const planPrice = PLAN_PRICES[plan_type];
  if (!planPrice) {
    return jsonResponse(
      { error: `plan_type inválido: '${plan_type}'. Valores aceptados: pro, premium` },
      400,
    );
  }

  // ── 2. Obtener datos del club ───────────────────────────────────────────────
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const { data: club, error: clubError } = await supabase
    .from("clubes")
    .select("id, nombre, email, slug")
    .eq("id", club_id)
    .single();

  if (clubError || !club) {
    return jsonResponse({ error: "Club no encontrado" }, 404);
  }

  if (!club.email) {
    return jsonResponse(
      { error: "El club no tiene email registrado. Completá el perfil antes de suscribirte." },
      422,
    );
  }

  // ── 3. Crear preapproval en Mercado Pago ────────────────────────────────────
  // MP_CURRENCY_ID permite adaptar la moneda según el país de la cuenta MP.
  // Por defecto se usa 'USD'. Si la cuenta es de Argentina, configurar 'ARS'.
  const mpCurrencyId = Deno.env.get("MP_CURRENCY_ID") ?? "USD";

  const preapprovalPayload = {
    reason: planPrice.reason,
    auto_recurring: {
      frequency: 1,
      frequency_type: "months",
      transaction_amount: planPrice.amount,
      currency_id: mpCurrencyId,
    },
    payer_email: club.email,
    back_url: `${APP_URL}/suscripcion/exito?plan=${plan_type}&slug=${club.slug ?? ""}`,  // eslint-disable-line
    external_reference: club_id,
    notification_url: WEBHOOK_URL,
    status: "pending",
  };

  const mpResponse = await fetch("https://api.mercadopago.com/preapproval", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(preapprovalPayload),
  });

  if (!mpResponse.ok) {
    const mpError = await mpResponse.text();
    console.error("Error MP:", mpResponse.status, mpError);
    return jsonResponse(
      { error: "Error al crear la suscripción en Mercado Pago", detail: mpError },
      502,
    );
  }

  const mpData = await mpResponse.json();

  // ── 4. Persistir en tabla suscripciones (upsert por club) ─────────────────
  const { error: upsertError } = await supabase
    .from("suscripciones")
    .upsert(
      {
        club_id,
        plan_id: plan_type,
        preapproval_id: mpData.id,
        status: mpData.status ?? "pending",
        next_payment_date: null,
        payer_email: club.email,
        external_reference: club_id,
      },
      { onConflict: "club_id" },
    );

  if (upsertError) {
    // El preapproval ya fue creado en MP — loguear pero no abortar
    console.error("Error al guardar suscripción en DB:", upsertError);
  }

  // ── 5. Responder con init_point ────────────────────────────────────────────
  return jsonResponse({
    init_point: mpData.init_point,
    preapproval_id: mpData.id,
    status: mpData.status,
    plan: plan_type,
    amount: planPrice.amount,
    currency: mpCurrencyId,
    price_display: `$${planPrice.amount} USD/mes`,
    tax_disclaimer: "Impuestos no incluidos",
  });
});
