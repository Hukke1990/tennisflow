/**
 * domain/webhookRules.js
 *
 * Reglas de dominio puras para el procesamiento de webhooks de Mercado Pago.
 * ❌ Sin I/O  ❌ Sin Supabase  ❌ Sin req/res
 *
 * Extraída de webhooksController.js y activarController.js.
 */

'use strict';

// ─── Mapeo de estados MP → estados internos ───────────────────────────────────

/**
 * Convierte el status de MP a estado interno de suscripción.
 * @type {Record<string, string>}
 */
const STATUS_MAP = Object.freeze({
  authorized: 'authorized',
  paused:     'paused',
  cancelled:  'cancelled',
  pending:    'pending',
});

/**
 * Mapea un status de MP a estado interno.
 * @param {string} mpStatus
 * @returns {string} Estado interno (default: 'pending')
 */
const normalizeSubscriptionStatus = (mpStatus) =>
  STATUS_MAP[mpStatus] ?? 'pending';

// ─── Derivación de plan ───────────────────────────────────────────────────────

/**
 * Intenta derivar el plan_id desde el campo `reason` del preapproval de MP.
 * Ningún plan detectado → retorna null (el caller debe usar fallback).
 *
 * @param {string|null|undefined} reason
 * @returns {string|null}
 */
const derivePlanFromReason = (reason) => {
  if (!reason || typeof reason !== 'string') return null;
  const normalized = reason.toLowerCase();

  if (normalized.includes('premium') || normalized.includes('grand slam')) return 'premium';
  if (normalized.includes('pro'))                                            return 'pro';
  if (normalized.includes('basico') || normalized.includes('básico'))       return 'basico';

  return null;
};

// ─── Clasificación de recursos MP ────────────────────────────────────────────

/**
 * Determina el tipo de recurso MP recibido en el webhook.
 * @param {'payment'|'subscription_preapproval'|string|null} topic
 * @param {string|null} type - campo type del body (ej: 'payment')
 * @returns {'payment' | 'preapproval' | 'unknown'}
 */
const classifyMpResource = (topic, type) => {
  const t = (topic || type || '').toLowerCase();
  if (t === 'payment')                        return 'payment';
  if (t.includes('preapproval'))              return 'preapproval';
  return 'unknown';
};

// ─── ¿Debe activarse el club? ─────────────────────────────────────────────────

/**
 * Regla: el club se activa si el nuevo status es 'authorized'.
 * @param {string} newStatus
 */
const shouldActivateClub = (newStatus) => newStatus === 'authorized';

/**
 * Regla: el club se desactiva si el status es 'cancelled' o 'paused'.
 * @param {string} newStatus
 */
const shouldDeactivateClub = (newStatus) =>
  newStatus === 'cancelled' || newStatus === 'paused';

// ─── Idempotencia ─────────────────────────────────────────────────────────────

/**
 * Un log con processing_status 'success' ya fue procesado y no debe reintentarse.
 * Cualquier otro estado ('processing', 'failed', 'retried') es retriable.
 *
 * @param {string|null} processingStatus
 * @returns {boolean}
 */
const isAlreadyProcessed = (processingStatus) =>
  processingStatus === 'success';

module.exports = {
  STATUS_MAP,
  normalizeSubscriptionStatus,
  derivePlanFromReason,
  classifyMpResource,
  shouldActivateClub,
  shouldDeactivateClub,
  isAlreadyProcessed,
};
