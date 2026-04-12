require('dotenv').config();
const express    = require('express');
const http       = require('http');
const cors       = require('cors');
const compression = require('compression');
const rateLimit  = require('express-rate-limit');
const { Server } = require('socket.io');
const { randomUUID } = require('crypto');
const logger  = require('./services/logger');
const metrics = require('./utils/metrics');
const getRateLimiterMiddleware = require('./utils/rateLimiterGlobal');

// Configuración de variables de entorno
const PORT = process.env.PORT || 3000;

// Orígenes permitidos
const ALLOWED_ORIGINS = [
  process.env.FRONTEND_URL,
  'http://localhost:5173',
  'http://localhost:3000',
].filter(Boolean);

// Rate limiters
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes. Intenta más tarde.' },
});

const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes en este endpoint. Intenta más tarde.' },
});

const verificarLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutos
  max: 40, // polling razonable para confirmar pago
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes de verificación. Intenta más tarde.' },
});

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Límite de webhooks alcanzado.' },
});

// Inicialización de Express
const app = express();

// Middlewares
app.use(cors({
  origin: (origin, callback) => {
    // Permitir requests sin origin (ej.: apps mobile, Postman en dev, curl)
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    return callback(new Error('Origen no permitido por CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Club-Id', 'X-Request-Id', 'X-Internal-Key'],
  credentials: true,
}));
app.use(compression());
// Rate limiting: global distribuido (Redis/Upstash) cuando está disponible; local como fallback
const _globalRlRedis = getRateLimiterMiddleware();
if (_globalRlRedis) {
  app.use(_globalRlRedis);           // Upstash: distribuido, multi-instancia
} else {
  app.use(globalLimiter);            // express-rate-limit: local, single-instance
}
// /verificar es consultado en polling para confirmar pago — debe estar ANTES del strictLimiter
// y excluirse de este, porque strictLimiter (20/15min) es más restrictivo que verificarLimiter (40/5min).
// Express hace prefix-match: `/api/activar` matchea también /api/activar/:id/verificar,
// por lo que usamos skip para evitar el doble conteo.
const skipVerificar = (req) => req.path.includes('/verificar');
app.use('/api/activar/:clubId/verificar', verificarLimiter);
app.use('/api/activar', (req, res, next) => {
  if (skipVerificar(req)) return next();
  return strictLimiter(req, res, next);
});
app.use('/api/webhooks', webhookLimiter);
app.use(express.json({ limit: '100kb' })); // Limitar payload para evitar ataques de body grande

// ── Observabilidad: requestId + req.context + request.start/end + métricas HTTP ──
app.use((req, res, next) => {
  // Request ID
  req.requestId = (req.headers['x-request-id'] || '').trim() || randomUUID();
  res.setHeader('x-request-id', req.requestId);

  // Contexto estructurado — disponible en toda la cadena de middleware/controllers
  req.context = {
    requestId: req.requestId,
    startTime: Date.now(),
    path:      req.path,
    method:    req.method,
    userId:    null,   // se sobreescribe tras auth
    clubId:    null,   // se sobreescribe tras auth
  };

  logger.info('request.start', {
    request_id: req.requestId,
    endpoint:   `${req.method} ${req.path}`,
  });

  // Hook al finalizar la respuesta
  res.on('finish', () => {
    const duration = Date.now() - req.context.startTime;

    // Rellenar userId/clubId que pudo haber seteado el middleware de auth
    const userId = req.authUser?.id      || req.context.userId || null;
    const clubId = req.authUser?.club_id || req.context.clubId || null;

    logger.info('request.end', {
      request_id:  req.requestId,
      endpoint:    `${req.method} ${req.path}`,
      user_id:     userId  || undefined,
      club_id:     clubId  || undefined,
      status:      res.statusCode,
      duration_ms: duration,
    });

    // Alerta automática: requests lentos (> 2s)
    if (duration > 2000) {
      logger.alert('slow_request', {
        alert_type:  'slow_request',
        request_id:  req.requestId,
        endpoint:    `${req.method} ${req.path}`,
        duration_ms: duration,
        user_id:     userId  || undefined,
        club_id:     clubId  || undefined,
        status:      res.statusCode,
      });
    }

    metrics.recordRequest({
      method:     req.method,
      path:       req.path,
      statusCode: res.statusCode,
      duration,
    });

    // Time-series en Redis: tracking por endpoint (fire-and-forget)
    metrics.trackEndpoint(req.path);
  });

  return next();
});

// Rutas
app.use('/api/disponibilidad', require('./routes/disponibilidadRoutes'));
app.use('/api/torneos', require('./routes/torneosRoutes'));
app.use('/api/partidos', require('./routes/partidosRoutes'));
app.use('/api/perfil', require('./routes/perfilRoutes'));
app.use('/api/dashboard', require('./routes/dashboardRoutes'));
app.use('/api/rankings', require('./routes/rankingsRoutes'));
app.use('/api/super-admin', require('./routes/superAdminRoutes'));
app.use('/api/club-config', require('./routes/clubConfigRoutes'));
app.use('/api/club',        require('./routes/clubRoutes'));
app.use('/api/suscripciones', require('./routes/suscripcionesRoutes'));
app.use('/api/activar', require('./routes/activarRoutes'));
app.use('/api/webhooks', require('./routes/webhooksRoutes'));
app.use('/api/internal', require('./routes/internalRoutes'));
app.use('/api',          require('./routes/healthRoutes'));

// Configuración del servidor HTTP nativo
const server = http.createServer(app);

// Inicialización de Socket.io
const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ["GET", "POST"]
  }
});

// Disponible para controladores que necesiten emitir eventos realtime sin romper APIs actuales.
global.__tennisflow_io = io;

// Rutas que requieren la instancia de io (deben ir después de inicializar io)
app.use('/api/canchas', require('./routes/canchasRoutes')(io));

// Evento básico de conexión en Socket.io
io.on('connection', (socket) => {
  logger.info('ws.connected', { socket_id: socket.id });

  socket.on('disconnect', () => {
    logger.info('ws.disconnected', { socket_id: socket.id });
  });
});

// Ruta de prueba
app.get('/', (req, res) => {
  res.json({ message: 'API de TennisFlow funcionando correctamente 🎾' });
});

// En entornos serverless (Vercel) no se debe abrir un puerto manualmente.
if (require.main === module) {
  server.listen(PORT, () => {
    logger.info('server.start', { port: PORT, env: process.env.NODE_ENV || 'development' });
  });
}

module.exports = app;
module.exports.server = server;
module.exports.io = io;
