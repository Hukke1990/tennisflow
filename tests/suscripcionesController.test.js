/**
 * tests/suscripcionesController.test.js
 *
 * Cubre:
 *   getEstado             — lectura de estado + pending_plan_id
 *   cancelar              — cancelación diferida (no degrada clubes.plan)
 *   anularCambioPendiente — limpia pending_plan_id y reintenta reactivar en MP
 */

const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const supabase = require('../services/supabase');
const suscripcionesController = require('../controllers/suscripcionesController');

const originalFrom  = supabase.from;
const originalFetch = global.fetch;

const TEST_CLUB_ID = '22222222-2222-4222-8222-222222222222';
const MP_TOKEN     = 'TEST_MP_TOKEN';

// ── Helpers ────────────────────────────────────────────────────────────────────

function createReq({ params = {}, body = {}, query = {}, authUser = { club_id: TEST_CLUB_ID } } = {}) {
  return { params, body, query, authUser, ip: '127.0.0.1', headers: {} };
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
 * Reemplaza supabase.from con una implementación basada en cola de respuestas.
 * Registra cada llamada en `calls` para poder inspeccionarla en los tests.
 * Devuelve una función que verifica que la cola haya sido consumida completamente.
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

/**
 * Crea un objeto Response-like para mockear global.fetch.
 */
function makeFetchResponse(body, ok = true, status = 200) {
  return {
    ok,
    status,
    json:  async () => body,
    text:  async () => JSON.stringify(body),
  };
}

/**
 * Reemplaza global.fetch con una cola de respuestas.
 * Registra cada llamada en `calls`.
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
});

// ══════════════════════════════════════════════════════════════════════════════
// getEstado
// ══════════════════════════════════════════════════════════════════════════════

test('getEstado — sin clubId retorna 400', async () => {
  const req = createReq({ authUser: {} });
  const res = createRes();

  await suscripcionesController.getEstado(req, res);

  assert.equal(res.statusCode, 400);
  assert.ok(res.payload.error, 'Debe devolver un mensaje de error');
});

test('getEstado — sin suscripcion devuelve plan basico y activa=false', async () => {
  const calls = [];
  const assertQ = mockSupabaseWithQueue([{ data: null, error: null }], calls);

  const req = createReq();
  const res = createRes();

  await suscripcionesController.getEstado(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.plan, 'basico');
  assert.equal(res.payload.activa, false);
  assert.equal(res.payload.suscripcion, null);
  assertQ();
});

test('getEstado — suscripcion activa devuelve plan y activa=true', async () => {
  const calls = [];
  const suscripcionData = {
    id: 'sub_1', plan_id: 'pro', status: 'authorized',
    next_payment_date: '2026-04-01T03:00:00Z', payer_email: 'test@test.com',
    pending_plan_id: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-03-01T00:00:00Z',
  };
  const assertQ = mockSupabaseWithQueue([{ data: suscripcionData, error: null }], calls);

  const req = createReq();
  const res = createRes();

  await suscripcionesController.getEstado(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.plan, 'pro');
  assert.equal(res.payload.activa, true);
  assert.equal(res.payload.pending_plan_id, null);
  assertQ();
});

test('getEstado — suscripcion con pending_plan_id lo incluye en la respuesta', async () => {
  const calls = [];
  const suscripcionData = {
    id: 'sub_1', plan_id: 'pro', status: 'authorized',
    next_payment_date: '2026-04-01T03:00:00Z', payer_email: 'test@test.com',
    pending_plan_id: 'basico', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-03-01T00:00:00Z',
  };
  const assertQ = mockSupabaseWithQueue([{ data: suscripcionData, error: null }], calls);

  const req = createReq();
  const res = createRes();

  await suscripcionesController.getEstado(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.pending_plan_id, 'basico', 'Debe exponer pending_plan_id en la respuesta');
  assertQ();
});

test('getEstado — error de Supabase retorna 500', async () => {
  const calls = [];
  const assertQ = mockSupabaseWithQueue([{ data: null, error: { message: 'DB error' } }], calls);

  const req = createReq();
  const res = createRes();

  await suscripcionesController.getEstado(req, res);

  assert.equal(res.statusCode, 500);
  assertQ();
});

// ══════════════════════════════════════════════════════════════════════════════
// cancelar
// ══════════════════════════════════════════════════════════════════════════════

test('cancelar — sin clubId retorna 400', async () => {
  const req = createReq({ authUser: {} });
  const res = createRes();

  await suscripcionesController.cancelar(req, res);

  assert.equal(res.statusCode, 400);
});

test('cancelar — sin suscripcion retorna 404', async () => {
  const calls = [];
  const assertQ = mockSupabaseWithQueue([{ data: null, error: null }], calls);
  process.env.MP_ACCESS_TOKEN = MP_TOKEN;

  const req = createReq();
  const res = createRes();

  await suscripcionesController.cancelar(req, res);

  assert.equal(res.statusCode, 404);
  assertQ();
});

test('cancelar — suscripcion ya cancelada retorna 409', async () => {
  const calls = [];
  const assertQ = mockSupabaseWithQueue([
    { data: { id: 'sub_1', preapproval_id: 'pre_1', status: 'cancelled' }, error: null },
  ], calls);
  process.env.MP_ACCESS_TOKEN = MP_TOKEN;

  const req = createReq();
  const res = createRes();

  await suscripcionesController.cancelar(req, res);

  assert.equal(res.statusCode, 409);
  assertQ();
});

test('cancelar — sin MP_ACCESS_TOKEN retorna 500', async () => {
  const calls = [];
  const assertQ = mockSupabaseWithQueue([
    { data: { id: 'sub_1', preapproval_id: 'pre_1', status: 'authorized' }, error: null },
  ], calls);
  // MP_ACCESS_TOKEN no está seteado

  const req = createReq();
  const res = createRes();

  await suscripcionesController.cancelar(req, res);

  assert.equal(res.statusCode, 500);
  assertQ();
});

test('cancelar — exitoso: setea pending_plan_id=basico y NO modifica clubes.plan', async () => {
  const calls = [];
  const assertQ = mockSupabaseWithQueue([
    { data: { id: 'sub_1', preapproval_id: 'pre_1', status: 'authorized' }, error: null }, // select suscripciones
    { data: null, error: null },  // update suscripciones
  ], calls);
  const fetchCalls = [];
  const assertFetch = mockFetchWithQueue([
    makeFetchResponse({ id: 'pre_1', status: 'cancelled' }), // MP cancelar preapproval
  ], fetchCalls);
  process.env.MP_ACCESS_TOKEN = MP_TOKEN;

  const req = createReq();
  const res = createRes();

  await suscripcionesController.cancelar(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.pending_plan_id, 'basico', 'La respuesta debe incluir pending_plan_id=basico');

  // El update de suscripciones debe incluir pending_plan_id='basico' y status='cancelled'
  const updateCall = calls.find(c => c.action === 'update' && c.table === 'suscripciones');
  assert.ok(updateCall, 'Debe haber un UPDATE de suscripciones');
  assert.equal(updateCall.payload.pending_plan_id, 'basico');
  assert.equal(updateCall.payload.status, 'cancelled');
  assert.equal(updateCall.payload.plan_id, 'basico');

  // NO debe haber ningún update en clubes
  const clubUpdate = calls.find(c => c.action === 'update' && c.table === 'clubes');
  assert.equal(clubUpdate, undefined, 'cancelar NO debe modificar clubes.plan (downgrade diferido)');

  assertQ();
  assertFetch();
});

test('cancelar — MP falla: retorna 502 sin tocar Supabase', async () => {
  const calls = [];
  const assertQ = mockSupabaseWithQueue([
    { data: { id: 'sub_1', preapproval_id: 'pre_1', status: 'authorized' }, error: null }, // select
    // NO se espera un segundo call porque MP falló
  ], calls);
  const fetchCalls = [];
  // Primera llamada falla, búsqueda por external_reference también falla
  const assertFetch = mockFetchWithQueue([
    makeFetchResponse({ message: 'not found' }, false, 404),   // tryCancel falla
    makeFetchResponse({ results: [] }, true, 200),             // búsqueda externa: sin resultados
  ], fetchCalls);
  process.env.MP_ACCESS_TOKEN = MP_TOKEN;

  const req = createReq();
  const res = createRes();

  await suscripcionesController.cancelar(req, res);

  assert.equal(res.statusCode, 502);
  // No debe quedar ningún update sin consumir en la cola (la cola extra fue vaciada ya)
  assert.equal(calls.filter(c => c.action === 'update').length, 0, 'Sin update si MP falla');

  assertFetch();
});

// ══════════════════════════════════════════════════════════════════════════════
// anularCambioPendiente
// ══════════════════════════════════════════════════════════════════════════════

test('anularCambioPendiente — sin suscripcion retorna 404', async () => {
  const calls = [];
  const assertQ = mockSupabaseWithQueue([{ data: null, error: null }], calls);
  process.env.MP_ACCESS_TOKEN = MP_TOKEN;

  const req = createReq();
  const res = createRes();

  await suscripcionesController.anularCambioPendiente(req, res);

  assert.equal(res.statusCode, 404);
  assertQ();
});

test('anularCambioPendiente — sin pending_plan_id retorna 409', async () => {
  const calls = [];
  const assertQ = mockSupabaseWithQueue([
    { data: { id: 'sub_1', status: 'authorized', preapproval_id: 'pre_1', plan_id: 'pro', pending_plan_id: null }, error: null },
  ], calls);
  process.env.MP_ACCESS_TOKEN = MP_TOKEN;

  const req = createReq();
  const res = createRes();

  await suscripcionesController.anularCambioPendiente(req, res);

  assert.equal(res.statusCode, 409);
  assertQ();
});

test('anularCambioPendiente — MP acepta reactivacion: reactivada=true y pending_plan_id=null', async () => {
  const calls = [];
  const assertQ = mockSupabaseWithQueue([
    { data: { id: 'sub_1', status: 'cancelled', preapproval_id: 'pre_1', plan_id: 'pro', pending_plan_id: 'basico' }, error: null }, // select
    { data: null, error: null }, // update suscripciones (Promise.all[0])
    { data: null, error: null }, // update clubes       (Promise.all[1])
  ], calls);
  const fetchCalls = [];
  const assertFetch = mockFetchWithQueue([
    makeFetchResponse({ id: 'pre_1', status: 'authorized' }), // MP reactivar
  ], fetchCalls);
  process.env.MP_ACCESS_TOKEN = MP_TOKEN;

  const req = createReq();
  const res = createRes();

  await suscripcionesController.anularCambioPendiente(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.reactivada, true);

  // suscripciones: status=authorized y pending_plan_id=null
  const subUpdate = calls.find(c => c.action === 'update' && c.table === 'suscripciones');
  assert.ok(subUpdate, 'Debe actualizar suscripciones');
  assert.equal(subUpdate.payload.pending_plan_id, null);
  assert.equal(subUpdate.payload.status, 'authorized');

  // clubes: plan restaurado al plan_id previo ('pro')
  const clubUpdate = calls.find(c => c.action === 'update' && c.table === 'clubes');
  assert.ok(clubUpdate, 'Debe actualizar clubes.plan al plan_id anterior');
  assert.equal(clubUpdate.payload.plan, 'pro');

  assertQ();
  assertFetch();
});

test('anularCambioPendiente — MP rechaza reactivacion: reactivada=false pero pending limpiado', async () => {
  const calls = [];
  const assertQ = mockSupabaseWithQueue([
    { data: { id: 'sub_1', status: 'cancelled', preapproval_id: 'pre_1', plan_id: 'pro', pending_plan_id: 'basico' }, error: null }, // select
    { data: null, error: null }, // update suscripciones (solo limpia pending)
  ], calls);
  const fetchCalls = [];
  const assertFetch = mockFetchWithQueue([
    makeFetchResponse({ message: 'Cannot reactivate' }, false, 400), // MP rechaza
  ], fetchCalls);
  process.env.MP_ACCESS_TOKEN = MP_TOKEN;

  const req = createReq();
  const res = createRes();

  await suscripcionesController.anularCambioPendiente(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.reactivada, false);

  // pending_plan_id debe limpiarse aunque MP rechace
  const subUpdate = calls.find(c => c.action === 'update' && c.table === 'suscripciones');
  assert.ok(subUpdate, 'Debe limpiar pending_plan_id aunque MP rechace');
  assert.equal(subUpdate.payload.pending_plan_id, null);

  // NO debe haber update en clubes (reactivación no exitosa)
  const clubUpdate = calls.find(c => c.action === 'update' && c.table === 'clubes');
  assert.equal(clubUpdate, undefined, 'No debe actualizar clubes si MP rechaza reactivación');

  assertQ();
  assertFetch();
});
