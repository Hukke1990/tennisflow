const supabase = require('../services/supabase');
const logger = require('../services/logger');
const { aplicarImpactoRanking, fetchPartidoCompat } = require('./partidosController');
const { fetchMp } = require('../services/mpClient');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * GET /api/internal/repair/elo-pendiente
 * Lista partidos finalizados con ganador pero sin ranking_impact_applied.
 * Solo super_admin.
 */
const listarEloPendiente = async (req, res) => {
  const { data, error } = await supabase
    .from('partidos')
    .select('id, torneo_id, jugador1_id, jugador2_id, ganador_id, estado, updated_at')
    .eq('estado', 'finalizado')
    .not('ganador_id', 'is', null)
    .eq('ranking_impact_applied', false)
    .order('updated_at', { ascending: false })
    .limit(200);

  if (error) {
    logger.reqError(req, '[repair] Error listando partidos con ELO pendiente', error);
    return res.status(500).json({ error: 'Error al consultar partidos.' });
  }

  return res.json({ count: (data || []).length, partidos: data || [] });
};

/**
 * POST /api/internal/repair/elo-pendiente/:partidoId
 * Reaplica ELO para un partido específico que quedó sin ranking_impact_applied.
 * Idempotente: si ya fue aplicado, retorna 200 con skipped:true.
 * Solo super_admin.
 */
const repararEloPartido = async (req, res) => {
  const { partidoId } = req.params;

  if (!UUID_REGEX.test(partidoId)) {
    return res.status(400).json({ error: 'ID de partido inválido.' });
  }

  const { data: partido, error: fetchError } = await fetchPartidoCompat(partidoId);
  if (fetchError || !partido) {
    return res.status(404).json({ error: 'Partido no encontrado.' });
  }

  if (partido.estado !== 'finalizado' || !partido.ganador_id) {
    return res.status(422).json({ error: 'El partido no está finalizado o no tiene ganador.' });
  }

  if (partido.ranking_impact_applied) {
    return res.status(200).json({ ok: true, skipped: true, reason: 'ranking_impact_ya_aplicado' });
  }

  const result = await aplicarImpactoRanking({ partidoActual: partido, ganador_id: partido.ganador_id });

  if (!result.applied) {
    logger.reqError(req, '[repair] aplicarImpactoRanking no se aplicó', result.error || null, {
      partido_id: partidoId,
      reason: result.reason,
    });
    return res.status(422).json({ ok: false, reason: result.reason, details: result.error?.message || null });
  }

  const { error: flagError } = await supabase
    .from('partidos')
    .update({ ranking_impact_applied: true })
    .eq('id', partidoId);

  if (flagError) {
    logger.reqError(req, '[repair] Error marcando ranking_impact_applied post-repair', flagError, { partido_id: partidoId });
  }

  logger.info('[repair] ELO reparado exitosamente', { partido_id: partidoId, result });
  return res.json({ ok: true, skipped: false, result });
};

// ─────────────────────────────────────────────────────────────────────────────
// FASE 6 — Webhook Repair
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/internal/repair/webhooks-fallidos
 * Lista entradas de log_pagos con processing_status = 'failed' o action_taken = 'error'.
 */
const listarWebhooksFallidos = async (req, res) => {
  const { data, error } = await supabase
    .from('log_pagos')
    .select('id, club_id, mp_resource_id, mp_topic, mp_action, mp_status, action_taken, fail_reason, processing_status, created_at')
    .or('processing_status.eq.failed,action_taken.eq.error')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    logger.reqError(req, '[repair] Error listando webhooks fallidos', error);
    return res.status(500).json({ error: 'Error al consultar log_pagos.' });
  }

  return res.json({ count: (data || []).length, logs: data || [] });
};

/**
 * POST /api/internal/repair/webhook-retry/:logId
 * Re-obtiene el estado actual desde MP para el recurso del log y actualiza clubes+suscripciones.
 * Idempotente: si processing_status = 'ok', retorna skipped:true.
 */
const retryWebhook = async (req, res) => {
  const { logId } = req.params;
  if (!UUID_REGEX.test(logId)) {
    return res.status(400).json({ error: 'ID de log inválido.' });
  }

  const { data: logEntry, error: logErr } = await supabase
    .from('log_pagos')
    .select('*')
    .eq('id', logId)
    .maybeSingle();

  if (logErr || !logEntry) {
    return res.status(404).json({ error: 'Entrada de log no encontrada.' });
  }

  if (logEntry.processing_status === 'success') {
    return res.json({ ok: true, skipped: true, reason: 'ya_procesado_correctamente' });
  }

  const mpToken = process.env.MP_ACCESS_TOKEN;
  if (!mpToken) {
    return res.status(500).json({ error: 'MP_ACCESS_TOKEN no configurado.' });
  }

  // Determinar path de MP según topic
  const topic = logEntry.mp_topic || '';
  const resourceId = logEntry.mp_resource_id;
  const mpPath = topic.includes('payment') ? `/v1/payments/${resourceId}` : `/preapproval/${resourceId}`;

  let mpData;
  try {
    mpData = await fetchMp(mpPath, mpToken);
  } catch (fetchErr) {
    logger.reqError(req, '[repair] Error al obtener recurso MP en retry', fetchErr, { log_id: logId, resource_id: resourceId });
    return res.status(502).json({ error: 'No se pudo obtener el recurso de MP.', detail: fetchErr.message });
  }

  const currentStatus = mpData.status || null;
  const clubId = mpData.external_reference || logEntry.club_id;

  const STATUS_MAP = { authorized: 'authorized', paused: 'paused', cancelled: 'cancelled', pending: 'pending' };
  const newStatus = STATUS_MAP[currentStatus] ?? 'pending';

  // Verificar estado actual en DB para evitar aplicar cambios redundantes
  let alreadySynced = false;
  if (clubId) {
    const { data: currentSub } = await supabase
      .from('suscripciones')
      .select('status')
      .eq('preapproval_id', resourceId)
      .maybeSingle();
    alreadySynced = currentSub?.status === newStatus;
  }

  if (!alreadySynced && clubId) {
    if (newStatus === 'authorized') {
      await supabase.from('clubes').update({ is_active: true }).eq('id', clubId);
    }
    await supabase.from('suscripciones')
      .upsert({ club_id: clubId, status: newStatus, preapproval_id: resourceId }, { onConflict: 'club_id' });
  }

  // Marcar log como retried
  await supabase.from('log_pagos').update({
    processing_status: 'retried',
    fail_reason:       null,
    action_taken:      newStatus === 'authorized' ? 'plan_upgraded' : 'no_action',
  }).eq('id', logId);

  logger.info('[repair] Webhook reintentado', {
    log_id:        logId,
    resource_id:   resourceId,
    new_status:    newStatus,
    already_synced: alreadySynced,
  });
  return res.json({ ok: true, skipped: false, already_synced: alreadySynced, new_status: newStatus, club_id: clubId });
};

module.exports = { listarEloPendiente, repararEloPartido, listarWebhooksFallidos, retryWebhook };

