/**
 * tests/webhooksController.test.js
 *
 * Cubre el controlador mercadopago con foco en el sistema de downgrade diferido:
 *   - preapproval authorized  → actualiza clubes.plan de inmediato
 *   - preapproval cancelled   → marca pending_plan_id, NO toca clubes.plan
 *   - preapproval paused      → igual que cancelled
 *   - payment approved + pending_plan_id → aplica cambio ahora y limpia pendiente
 *   - payment approved sin pending_plan_id → no toca clubes.plan
 *   - firma inválida          → 401
 *   - ping sin datos          → 200 received
 *   - error al obtener preapproval → 200 con warning
 */

const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const supabase = require('../services/supabase');
const webhooksController = require('../controllers/webhooksController');

const originalFrom  = supabase.from;
const originalFetch = global.fetch;

const TEST_CLUB_ID    = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const TEST_PREAPPROVAL = 'pre_abc123';
const TEST_PAYMENT_ID  = 'pay_xyz789';

// ── Helpers ────────────────────────────────────────────────────────────────────

function createReq({
  body    = {},
  query   = {},
  headers = {},
  ip      = '10.0.0.1',
} = {}) {
  return { body, query, headers, ip };
}

function createRes() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(data)   { this.payload   = data; return this; },
  };
}

/**
 * Mock de supabase.from con cola de respuestas predefinidas.
 * Registra cada llamada en `calls`.
 */
function mockSupabaseWithQueue(queue, calls = []) {
  supabase.from = (table) => {
    const state = {
      table,
      action:     null,
      payload:    null,
      filters:    [],
      upsertOpts: null,
      selectArgs: null,
      single:     false,
    };

    let executed = false;

    const execute = () => {
      if (executed) throw new Error(`Query para '${table}' ejecutada más de una vez`);
      executed = true;
      calls.push(JSON.parse(JSON.stringify(state)));
      if (queue.length === 0) throw new Error(`Cola vacía al intentar resolver '${table}.${state.action}'`);
      const next = queue.shift();
      return typeof next === 'function' ? next(state) : next;
    };

    const proxy = {
      select(c)       { if (!state.action) state.action = 'select'; state.selectArgs = c; return proxy; },
      insert(p)       { state.action = 'insert';  state.payload = p; return proxy; },
      update(p)       { state.action = 'update';  state.payload = p; return proxy; },
      upsert(p, opts) { state.action = 'upsert';  state.payload = p; state.upsertOpts = opts; return proxy; },
      delete()        { state.action = 'delete';  return proxy; },
      eq(c, v)        { state.filters.push({ op: 'eq',  c, v }); return proxy; },
      neq(c, v)       { state.filters.push({ op: 'neq', c, v }); return proxy; },
      maybeSingle()   { state.single = true; return Promise.resolve(execute()); },
      single()        { state.single = true; return Promise.resolve(execute()); },
      then(res, rej)  { return Promise.resolve(execute()).then(res, rej); },
    };

    return proxy;
  };

  return () => assert.equal(queue.length, 0, `Quedaron ${queue.length} mock(s) de Supabase sin consumir`);
}

/** Respuesta HTTP-like para mockear global.fetch */
function makeFetchResponse(body, ok = true, status = 200) {
  return {
    ok,
    status,
    json:  async () => body,
    text:  async () => JSON.stringify(body),
  };
}

/**
 * Mock de global.fetch con cola de respuestas.
 * El primer elemento de la cola se devuelve para la primera llamada, etc.
 */
function mockFetchWithQueue(queue, calls = []) {
  global.fetch = async (url, opts = {}) => {
    calls.push({ url, method: opts?.method ?? 'GET' });
    if (queue.length === 0) throw new Error(`Cola de fetch vacía para URL: ${url}`);
    return queue.shift();
  };
  return () => assert.equal(queue.length, 0, `Quedaron ${queue.length} mock(s) de fetch sin consumir`);
}

afterEach(() => {
  supabase.from  = originalFrom;
  global.fetch   = originalFetch;
  delete process.env.MP_ACCESS_TOKEN;
  delete process.env.MP_WEBHOOK_SECRET;
});

// ══════════════════════════════════════════════════════════════════════════════
// Firma y casos triviales
// ══════════════════════════════════════════════════════════════════════════════

test('mercadopago — ping sin datos retorna 200 received', async () => {
  process.env.MP_ACCESS_TOKEN = 'TEST_TOKEN';

  const req = createReq({ body: {} }); // sin type/topic/id
  const res = createRes();

  await webhooksController.mercadopago(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.received, true);
});

test('mercadopago — firma invalida retorna 401', async () => {
  process.env.MP_ACCESS_TOKEN  = 'TEST_TOKEN';
  process.env.MP_WEBHOOK_SECRET = 'super_secret';

  const req = createReq({
    body:    { type: 'subscription_preapproval', data: { id: TEST_PREAPPROVAL } },
    headers: {
      'x-signature':  'ts=1234567890,v1=0000000000000000000000000000000000000000000000000000000000000000',
      'x-request-id': 'req-test-1',
    },
  });
  const res = createRes();

  await webhooksController.mercadopago(req, res);

  assert.equal(res.statusCode, 401);
});

test('mercadopago — error al obtener preapproval de MP retorna 200 con warning', async () => {
  process.env.MP_ACCESS_TOKEN = 'TEST_TOKEN';

  const fetchCalls = [];
  mockFetchWithQueue([
    makeFetchResponse({ message: 'não encontrado' }, false, 404), // fetchMp lanza error
  ], fetchCalls);

  const req = createReq({
    body: { type: 'subscription_preapproval', data: { id: TEST_PREAPPROVAL } },
  });
  const res = createRes();

  await webhooksController.mercadopago(req, res);

  assert.equal(res.statusCode, 200);
  assert.ok(res.payload.warning, 'Debe incluir un campo warning');
});

// ══════════════════════════════════════════════════════════════════════════════
// Preapproval AUTHORIZED — actualiza plan del club de inmediato
// ══════════════════════════════════════════════════════════════════════════════

test('mercadopago — preapproval authorized actualiza plan del club', async () => {
  process.env.MP_ACCESS_TOKEN = 'TEST_TOKEN';

  const mpPreapprovalData = {
    id:                 TEST_PREAPPROVAL,
    status:             'authorized',
    external_reference: TEST_CLUB_ID,
    reason:             'SetGo Pro — Suscripción mensual',
    payer_email:        'club@test.com',
    summarized:         { next_payment_date: '2026-04-24T03:00:00Z' },
  };

  const calls = [];
  // Orden de llamadas para preapproval authorized:
  // 1. clubes.select('plan').eq(club_id).maybeSingle()
  // 2. suscripciones.select('id, plan_id').eq(preapproval_id).maybeSingle()
  // 3. suscripciones.upsert(...)
  // 4. clubes.update({plan:'pro'}).eq(club_id)            ← authorized branch
  // 5. pagos_historial.insert(...)                        ← authorized + subRow.id
  // 6. log_pagos.insert(...)
  const assertQ = mockSupabaseWithQueue([
    { data: { plan: 'basico' },                    error: null }, // 1 clubes select
    { data: { id: 'sub_1', plan_id: 'pro' },       error: null }, // 2 suscripciones select
    { data: null,                                  error: null }, // 3 suscripciones upsert
    { data: null,                                  error: null }, // 4 clubes update
    { data: null,                                  error: null }, // 5 pagos_historial insert
    { data: null,                                  error: null }, // 6 log_pagos insert
  ], calls);

  const fetchCalls = [];
  const assertFetch = mockFetchWithQueue([
    makeFetchResponse(mpPreapprovalData),
  ], fetchCalls);

  const req = createReq({
    body: { type: 'subscription_preapproval', data: { id: TEST_PREAPPROVAL } },
  });
  const res = createRes();

  await webhooksController.mercadopago(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.action_taken, 'plan_upgraded');

  // clubes.plan debe haber sido actualizado a 'pro'
  const clubUpdate = calls.find(c => c.action === 'update' && c.table === 'clubes');
  assert.ok(clubUpdate, 'Debe actualizar clubes.plan');
  assert.equal(clubUpdate.payload.plan, 'pro');

  // NO debe haber marcado pending_plan_id (solo aplica al cancelar/pausar)
  const subUpdates = calls.filter(c => c.action === 'update' && c.table === 'suscripciones');
  const pendingUpdate = subUpdates.find(c => 'pending_plan_id' in (c.payload ?? {}));
  assert.equal(pendingUpdate, undefined, 'authorized NO debe setear pending_plan_id');

  assertQ();
  assertFetch();
});

// ══════════════════════════════════════════════════════════════════════════════
// Preapproval CANCELLED — downgrade diferido (NO toca clubes.plan)
// ══════════════════════════════════════════════════════════════════════════════

test('mercadopago — preapproval cancelled marca pending_plan_id sin degradar club', async () => {
  process.env.MP_ACCESS_TOKEN = 'TEST_TOKEN';

  const mpPreapprovalData = {
    id:                 TEST_PREAPPROVAL,
    status:             'cancelled',
    external_reference: TEST_CLUB_ID,
    reason:             'SetGo Pro — Suscripción mensual',
    payer_email:        'club@test.com',
    summarized:         { next_payment_date: null },
  };

  const calls = [];
  // Orden de llamadas para preapproval cancelled:
  // 1. clubes.select('plan').eq(club_id).maybeSingle()
  // 2. suscripciones.select('id, plan_id').eq(preapproval_id).maybeSingle()
  // 3. suscripciones.upsert(...)  ← plan_id='basico' en el upsert payload (estado interno)
  // 4. suscripciones.update({pending_plan_id:'basico'}).eq(club_id)  ← downgrade diferido
  // 5. log_pagos.insert(...)
  const assertQ = mockSupabaseWithQueue([
    { data: { plan: 'pro' },                 error: null }, // 1 clubes select
    { data: { id: 'sub_1', plan_id: 'pro' }, error: null }, // 2 suscripciones select
    { data: null,                            error: null }, // 3 suscripciones upsert
    { data: null,                            error: null }, // 4 suscripciones update pending
    { data: null,                            error: null }, // 5 log_pagos insert
  ], calls);

  const fetchCalls = [];
  const assertFetch = mockFetchWithQueue([
    makeFetchResponse(mpPreapprovalData),
  ], fetchCalls);

  const req = createReq({
    body: { type: 'subscription_preapproval', data: { id: TEST_PREAPPROVAL } },
  });
  const res = createRes();

  await webhooksController.mercadopago(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.action_taken, 'pending_downgrade', 'Debe reportar pending_downgrade');

  // CLAVE: clubes.plan NO debe haberse modificado
  const clubUpdate = calls.find(c => c.action === 'update' && c.table === 'clubes');
  assert.equal(clubUpdate, undefined, 'cancelled NO debe tocar clubes.plan (downgrade diferido)');

  // pending_plan_id debe haberse marcado en suscripciones
  const pendingUpdate = calls.find(
    c => c.action === 'update' && c.table === 'suscripciones' && c.payload?.pending_plan_id === 'basico'
  );
  assert.ok(pendingUpdate, 'Debe marcar pending_plan_id=basico en suscripciones');

  assertQ();
  assertFetch();
});

test('mercadopago — preapproval paused marca pending_plan_id sin degradar club', async () => {
  process.env.MP_ACCESS_TOKEN = 'TEST_TOKEN';

  const mpPreapprovalData = {
    id:                 TEST_PREAPPROVAL,
    status:             'paused',
    external_reference: TEST_CLUB_ID,
    reason:             'SetGo Grand Slam — Suscripción mensual',
    payer_email:        'club@test.com',
    summarized:         { next_payment_date: '2026-04-24T03:00:00Z' },
  };

  const calls = [];
  const assertQ = mockSupabaseWithQueue([
    { data: { plan: 'premium' },             error: null }, // clubes
    { data: { id: 'sub_1', plan_id: 'premium' }, error: null }, // suscripciones
    { data: null, error: null }, // upsert
    { data: null, error: null }, // pending_plan_id update
    { data: null, error: null }, // log_pagos
  ], calls);

  const fetchCalls = [];
  const assertFetch = mockFetchWithQueue([
    makeFetchResponse(mpPreapprovalData),
  ], fetchCalls);

  const req = createReq({
    body: { type: 'subscription_preapproval', data: { id: TEST_PREAPPROVAL } },
  });
  const res = createRes();

  await webhooksController.mercadopago(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.action_taken, 'pending_downgrade');

  const clubUpdate = calls.find(c => c.action === 'update' && c.table === 'clubes');
  assert.equal(clubUpdate, undefined, 'paused NO debe tocar clubes.plan');

  const pendingUpdate = calls.find(
    c => c.action === 'update' && c.table === 'suscripciones' && c.payload?.pending_plan_id === 'basico'
  );
  assert.ok(pendingUpdate, 'Debe marcar pending_plan_id=basico para suscripción pausada');

  assertQ();
  assertFetch();
});

// ══════════════════════════════════════════════════════════════════════════════
// Payment APPROVED + pending_plan_id → aplica el cambio de plan ahora
// ══════════════════════════════════════════════════════════════════════════════

test('mercadopago — payment approved con pending_plan_id aplica el cambio y lo limpia', async () => {
  process.env.MP_ACCESS_TOKEN = 'TEST_TOKEN';

  const mpPaymentData = {
    id:                 TEST_PAYMENT_ID,
    status:             'approved',
    external_reference: TEST_CLUB_ID,
    preapproval_id:     TEST_PREAPPROVAL,
    transaction_amount: 50,
    currency_id:        'USD',
    date_approved:      '2026-03-24T12:00:00Z',
    description:        'SetGo Pro charge',
    payer:              { email: 'club@test.com' },
  };

  const calls = [];
  // Orden de llamadas para payment approved + pending_plan_id:
  // 1. suscripciones.select('id, plan_id, pending_plan_id, club_id').eq(preapproval_id).maybeSingle()
  // 2. Promise.all[0]: clubes.update({plan:'basico'}).eq('id', club_id)
  // 3. Promise.all[1]: suscripciones.update({pending_plan_id:null, plan_id:'basico'}).eq('id', sub_id)
  // 4. pagos_historial.upsert(...)
  // 5. log_pagos.insert(...)
  const assertQ = mockSupabaseWithQueue([
    { data: { id: 'sub_1', plan_id: 'pro', pending_plan_id: 'basico', club_id: TEST_CLUB_ID }, error: null }, // 1
    { data: null, error: null }, // 2 clubes update
    { data: null, error: null }, // 3 suscripciones update
    { data: null, error: null }, // 4 pagos_historial upsert
    { data: null, error: null }, // 5 log_pagos insert
  ], calls);

  const fetchCalls = [];
  const assertFetch = mockFetchWithQueue([
    makeFetchResponse(mpPaymentData),
  ], fetchCalls);

  const req = createReq({
    body: { type: 'subscription_authorized_payment', data: { id: TEST_PAYMENT_ID } },
  });
  const res = createRes();

  await webhooksController.mercadopago(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.type, 'payment');

  // clubes.plan debe actualizarse al pending ('basico')
  const clubUpdate = calls.find(c => c.action === 'update' && c.table === 'clubes');
  assert.ok(clubUpdate, 'Debe actualizar clubes.plan al pending_plan_id');
  assert.equal(clubUpdate.payload.plan, 'basico');

  // suscripciones: pending_plan_id limpiado y plan_id actualizado
  const subUpdate = calls.find(
    c => c.action === 'update' && c.table === 'suscripciones' && c.payload?.pending_plan_id === null
  );
  assert.ok(subUpdate, 'Debe limpiar pending_plan_id de suscripciones');
  assert.equal(subUpdate.payload.plan_id, 'basico');

  assertQ();
  assertFetch();
});

// ══════════════════════════════════════════════════════════════════════════════
// Payment APPROVED sin pending_plan_id → no modifica clubes
// ══════════════════════════════════════════════════════════════════════════════

test('mercadopago — payment approved sin pending_plan_id no modifica plan del club', async () => {
  process.env.MP_ACCESS_TOKEN = 'TEST_TOKEN';

  const mpPaymentData = {
    id:                 TEST_PAYMENT_ID,
    status:             'approved',
    external_reference: TEST_CLUB_ID,
    preapproval_id:     TEST_PREAPPROVAL,
    transaction_amount: 50,
    currency_id:        'USD',
    date_approved:      '2026-03-24T12:00:00Z',
    description:        'SetGo Pro charge',
    payer:              { email: 'club@test.com' },
  };

  const calls = [];
  // Orden: sin pending_plan_id → no hay Promise.all con clubes/suscripciones
  // 1. suscripciones select
  // 2. pagos_historial upsert
  // 3. log_pagos insert
  const assertQ = mockSupabaseWithQueue([
    { data: { id: 'sub_1', plan_id: 'pro', pending_plan_id: null, club_id: TEST_CLUB_ID }, error: null }, // 1
    { data: null, error: null }, // 2 pagos_historial upsert
    { data: null, error: null }, // 3 log_pagos insert
  ], calls);

  const fetchCalls = [];
  const assertFetch = mockFetchWithQueue([
    makeFetchResponse(mpPaymentData),
  ], fetchCalls);

  const req = createReq({
    body: { type: 'subscription_authorized_payment', data: { id: TEST_PAYMENT_ID } },
  });
  const res = createRes();

  await webhooksController.mercadopago(req, res);

  assert.equal(res.statusCode, 200);

  // Sin pending_plan_id NO debe haber update en clubes ni limpieza de pending
  const clubUpdate = calls.find(c => c.action === 'update' && c.table === 'clubes');
  assert.equal(clubUpdate, undefined, 'Sin pending_plan_id no debe tocar clubes.plan');

  const subUpdatePending = calls.find(
    c => c.action === 'update' && c.table === 'suscripciones' && 'pending_plan_id' in (c.payload ?? {})
  );
  assert.equal(subUpdatePending, undefined, 'Sin pending_plan_id no debe limpiar nada en suscripciones');

  assertQ();
  assertFetch();
});

// ══════════════════════════════════════════════════════════════════════════════
// Payment REJECTED — no modifica nada relevante
// ══════════════════════════════════════════════════════════════════════════════

test('mercadopago — payment rejected no aplica pending_plan_id aunque exista', async () => {
  process.env.MP_ACCESS_TOKEN = 'TEST_TOKEN';

  const mpPaymentData = {
    id:                 TEST_PAYMENT_ID,
    status:             'rejected',
    external_reference: TEST_CLUB_ID,
    preapproval_id:     TEST_PREAPPROVAL,
    transaction_amount: 50,
    currency_id:        'USD',
    date_approved:      null,
    description:        'charge rejected',
    payer:              { email: 'club@test.com' },
  };

  const calls = [];
  const assertQ = mockSupabaseWithQueue([
    { data: { id: 'sub_1', plan_id: 'pro', pending_plan_id: 'basico', club_id: TEST_CLUB_ID }, error: null }, // select
    { data: null, error: null }, // pagos_historial upsert
    { data: null, error: null }, // log_pagos insert
  ], calls);

  const fetchCalls = [];
  const assertFetch = mockFetchWithQueue([
    makeFetchResponse(mpPaymentData),
  ], fetchCalls);

  const req = createReq({
    body: { type: 'subscription_authorized_payment', data: { id: TEST_PAYMENT_ID } },
  });
  const res = createRes();

  await webhooksController.mercadopago(req, res);

  assert.equal(res.statusCode, 200);

  // REJECTED no debe aplicar el pending_plan_id
  const clubUpdate = calls.find(c => c.action === 'update' && c.table === 'clubes');
  assert.equal(clubUpdate, undefined, 'Pago rechazado NO debe aplicar pending_plan_id');

  assertQ();
  assertFetch();
});
