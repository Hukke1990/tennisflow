/**
 * services/logger.js
 *
 * Logger estructurado. Todos los campos son opcionales salvo `msg`.
 * En producción emite JSON; en desarrollo emite texto legible.
 *
 * Cada línea incluye:
 *   ts          → ISO timestamp
 *   level       → 'info' | 'warn' | 'error'
 *   endpoint    → ruta HTTP (si aplica)
 *   request_id  → x-request-id del header o UUID generado
 *   club_id     → tenant
 *   user_id     → usuario autenticado
 *   msg         → mensaje principal
 *   error       → { message, code, stack? }
 *   [extra]     → cualquier campo adicional pasado al logger
 *
 * Preparado para integración futura con Sentry:
 *   import * as Sentry from '@sentry/node';
 *   Sentry.captureException(err, { extra: context });
 */

const IS_PROD = process.env.NODE_ENV === 'production';
const IS_TEST = process.env.NODE_ENV === 'test';

/**
 * Serializa un Error de manera segura.
 */
const serializeError = (err) => {
  if (!err) return undefined;
  if (typeof err === 'string') return { message: err };
  return {
    message: err.message || String(err),
    code:    err.code    || undefined,
    // Stack solo en desarrollo para evitar leaks en producción
    stack:   IS_PROD ? undefined : err.stack,
  };
};

/**
 * Construye el objeto de log y lo emite por stdout/stderr.
 *
 * @param {'info'|'warn'|'error'} level
 * @param {string} msg
 * @param {object} [ctx]
 * @param {string} [ctx.endpoint]
 * @param {string} [ctx.request_id]
 * @param {string} [ctx.club_id]
 * @param {string} [ctx.user_id]
 * @param {Error|string} [ctx.error]
 */
const emit = (level, msg, ctx = {}) => {
  if (IS_TEST) return; // silenciar durante tests unitarios

  const { error, endpoint, request_id, club_id, user_id, ...rest } = ctx;

  const entry = {
    ts:         new Date().toISOString(),
    level,
    msg,
    ...(endpoint   && { endpoint }),
    ...(request_id && { request_id }),
    ...(club_id    && { club_id }),
    ...(user_id    && { user_id }),
    ...(error      && { error: serializeError(error) }),
    ...rest,
  };

  const output = IS_PROD ? JSON.stringify(entry) : formatDev(entry);

  if (level === 'error') {
    process.stderr.write(output + '\n');
  } else {
    process.stdout.write(output + '\n');
  }
};

const formatDev = (entry) => {
  const prefix = `[${entry.ts}] [${entry.level.toUpperCase()}]`;
  const loc    = [entry.endpoint, entry.club_id && `club:${entry.club_id}`].filter(Boolean).join(' ');
  const errPart = entry.error ? ` — ${entry.error.message}${entry.error.code ? ` (${entry.error.code})` : ''}` : '';
  return `${prefix}${loc ? ' ' + loc : ''} ${entry.msg}${errPart}`;
};

/**
 * Extrae contexto común de un Request de Express.
 *
 * @param {import('express').Request} req
 * @returns {{ endpoint: string, request_id: string, club_id: string, user_id: string }}
 */
const fromRequest = (req) => ({
  endpoint:   req ? `${req.method} ${req.path}` : undefined,
  request_id: req?.headers?.['x-request-id'] || req?.id || undefined,
  club_id:    req?.query?.club_id || req?.body?.club_id || req?.authUser?.club_id || undefined,
  user_id:    req?.authUser?.id || undefined,
});

const logger = {
  info:  (msg, ctx = {}) => emit('info',  msg, ctx),
  warn:  (msg, ctx = {}) => emit('warn',  msg, ctx),
  error: (msg, ctx = {}) => emit('error', msg, ctx),

  /**
   * Alert: error crítico que requiere atención inmediata.
   * Estructura lista para dispatch a Sentry / PagerDuty.
   *
   * @param {string} alertType - 'webhook_failed' | 'timeout_mp' | 'rpc_error' | 'payment_error' | 'mp_fetch_error'
   * @example logger.alert('[webhook] Timeout MP', { alert_type: 'timeout_mp', resource_id: '...' })
   *
   * Para activar Sentry, descomentar:
   *   import * as Sentry from '@sentry/node';
   *   Sentry.captureException(ctx.error || new Error(msg), { level: 'fatal', extra: context });
   */
  alert: (msg, ctx = {}) => {
    emit('error', msg, { ...ctx, alert_level: 'critical' });
    // SENTRY_HOOK: Sentry.captureException(ctx.error || new Error(msg), { extra: ctx });
  },

  /** Helper: loguea un error con contexto de Request */
  reqError: (req, msg, err, extra = {}) => emit('error', msg, {
    ...fromRequest(req),
    error: err,
    ...extra,
  }),

  /** Helper: loguea warn con contexto de Request */
  reqWarn: (req, msg, extra = {}) => emit('warn', msg, {
    ...fromRequest(req),
    ...extra,
  }),

  fromRequest,

  /**
   * Extrae contexto completo del request para correlación de trazas.
   * Alias estructurado de fromRequest() — incluye campos adicionales.
   *
   * @param {import('express').Request} req
   * @param {object} [extra] - Campos adicionales (action, resource_id, etc.)
   * @returns {object}
   */
  withContext: (req, extra = {}) => ({
    request_id: req?.requestId || req?.headers?.['x-request-id'] || undefined,
    path:       req?.path || undefined,
    method:     req?.method || undefined,
    user_id:    req?.authUser?.id || undefined,
    club_id:    req?.authUser?.club_id || req?.query?.club_id || undefined,
    ...extra,
  }),
};

module.exports = logger;
