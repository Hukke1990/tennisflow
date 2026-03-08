const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const supabase = require('../services/supabase');
const torneosController = require('../controllers/torneosController');

const originalFrom = supabase.from;

function createReq({ params = {}, body = {} } = {}) {
  return { params, body };
}

function createRes() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.payload = data;
      return this;
    },
  };
}

function mockSupabaseWithQueue(queue, calls) {
  supabase.from = (table) => {
    const state = {
      table,
      action: null,
      payload: null,
      filters: [],
      selectArgs: null,
      order: null,
      single: false,
    };

    let executed = false;

    const execute = () => {
      if (executed) {
        throw new Error(`La query para ${table} ya se ejecuto una vez.`);
      }
      executed = true;

      calls.push(JSON.parse(JSON.stringify(state)));

      if (queue.length === 0) {
        throw new Error(`No hay respuestas mock disponibles para la tabla ${table}.`);
      }

      const next = queue.shift();
      return typeof next === 'function' ? next(state) : next;
    };

    return {
      select(columns, options) {
        if (!state.action) {
          state.action = 'select';
        }
        state.selectArgs = { columns, options };
        return this;
      },
      insert(payload) {
        state.action = 'insert';
        state.payload = payload;
        return this;
      },
      update(payload) {
        state.action = 'update';
        state.payload = payload;
        return this;
      },
      delete() {
        state.action = 'delete';
        return this;
      },
      eq(column, value) {
        state.filters.push({ op: 'eq', column, value });
        return this;
      },
      gt(column, value) {
        state.filters.push({ op: 'gt', column, value });
        return this;
      },
      gte(column, value) {
        state.filters.push({ op: 'gte', column, value });
        return this;
      },
      lt(column, value) {
        state.filters.push({ op: 'lt', column, value });
        return this;
      },
      lte(column, value) {
        state.filters.push({ op: 'lte', column, value });
        return this;
      },
      in(column, values) {
        state.filters.push({ op: 'in', column, values });
        return this;
      },
      or(expression) {
        state.filters.push({ op: 'or', expression });
        return this;
      },
      order(column, options) {
        state.order = { column, options };
        return this;
      },
      single() {
        state.single = true;
        return Promise.resolve(execute());
      },
      then(resolve, reject) {
        return Promise.resolve(execute()).then(resolve, reject);
      },
    };
  };

  return () => {
    assert.equal(queue.length, 0, `Quedaron ${queue.length} respuestas mock sin consumir.`);
  };
}

afterEach(() => {
  supabase.from = originalFrom;
});

test('crear torneo valido con ventana de inscripcion', async () => {
  const calls = [];
  const queue = [{ data: [{ id: 'torneo_1' }], error: null }];
  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);

  const req = createReq({
    body: {
      titulo: 'Copa Otono',
      cupos_max: 16,
      costo: 7500,
      fecha_inicio_inscripcion: '2026-03-01T10:00:00Z',
      fecha_cierre_inscripcion: '2026-03-10T10:00:00Z',
      fecha_inicio: '2026-03-12T10:00:00Z',
      fecha_fin: '2026-03-15T18:00:00Z',
    },
  });
  const res = createRes();

  await torneosController.crearTorneo(req, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.payload.torneo.id, 'torneo_1');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].table, 'torneos');
  assert.equal(calls[0].action, 'insert');
  assert.equal(calls[0].payload[0].fecha_inicio_inscripcion, '2026-03-01T10:00:00Z');
  assert.equal(calls[0].payload[0].fecha_cierre_inscripcion, '2026-03-10T10:00:00Z');
  assert.equal(calls[0].payload[0].fecha_fin, '2026-03-15T18:00:00Z');
  assert.equal(calls[0].payload[0].estado, 'publicado');

  assertQueueEmpty();
});

test('crear torneo con ventana invalida falla', async () => {
  const calls = [];
  const queue = [];
  mockSupabaseWithQueue(queue, calls);

  const req = createReq({
    body: {
      titulo: 'Copa Invierno',
      cupos_max: 8,
      costo: 5000,
      fecha_inicio_inscripcion: '2026-04-20T10:00:00Z',
      fecha_cierre_inscripcion: '2026-04-10T10:00:00Z',
      fecha_inicio: '2026-04-22T10:00:00Z',
      fecha_fin: '2026-04-25T18:00:00Z',
    },
  });
  const res = createRes();

  await torneosController.crearTorneo(req, res);

  assert.equal(res.statusCode, 400);
  assert.match(res.payload.error, /fecha_inicio_inscripcion/i);
  assert.equal(calls.length, 0);
});

test('crear torneo en borrador desde publicar falla', async () => {
  const calls = [];
  const queue = [];
  mockSupabaseWithQueue(queue, calls);

  const req = createReq({
    body: {
      titulo: 'Copa Primavera',
      cupos_max: 12,
      costo: 3500,
      estado: 'borrador',
      fecha_inicio_inscripcion: '2026-05-01T10:00:00Z',
      fecha_cierre_inscripcion: '2026-05-10T10:00:00Z',
      fecha_inicio: '2026-05-12T10:00:00Z',
      fecha_fin: '2026-05-15T18:00:00Z',
    },
  });
  const res = createRes();

  await torneosController.crearTorneo(req, res);

  assert.equal(res.statusCode, 400);
  assert.match(res.payload.error, /borrador/i);
  assert.equal(calls.length, 0);
});

test('crear torneo con canchas asignadas valida e inserta relaciones', async () => {
  const calls = [];
  const cancha1 = '11111111-1111-4111-8111-111111111111';
  const cancha2 = '22222222-2222-4222-8222-222222222222';
  const queue = [
    {
      data: [
        { id: cancha1, esta_disponible: true },
        { id: cancha2, esta_disponible: true },
      ],
      error: null,
    },
    { data: [{ id: 'torneo_5' }], error: null },
    { error: null },
  ];
  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);

  const req = createReq({
    body: {
      titulo: 'Copa con Canchas',
      cupos_max: 8,
      costo: 2000,
      fecha_inicio_inscripcion: '2026-07-01T10:00:00Z',
      fecha_cierre_inscripcion: '2026-07-05T10:00:00Z',
      fecha_inicio: '2026-07-06T10:00:00Z',
      fecha_fin: '2026-07-08T10:00:00Z',
      canchas_asignadas: [cancha1],
      canchas_ids: [cancha1, cancha2],
    },
  });
  const res = createRes();

  await torneosController.crearTorneo(req, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.payload.torneo.id, 'torneo_5');
  assert.deepEqual(res.payload.canchas_asignadas, [cancha1, cancha2]);

  assert.equal(calls.length, 3);
  assert.equal(calls[0].table, 'canchas');
  assert.equal(calls[1].table, 'torneos');
  assert.equal(calls[2].table, 'torneo_canchas');
  assert.equal(calls[2].action, 'insert');
  assert.equal(calls[2].payload.length, 2);

  assertQueueEmpty();
});

test('crear torneo falla si alguna cancha asignada no existe', async () => {
  const calls = [];
  const cancha1 = '11111111-1111-4111-8111-111111111111';
  const cancha2 = '22222222-2222-4222-8222-222222222222';
  const queue = [
    {
      data: [{ id: cancha1, esta_disponible: true }],
      error: null,
    },
  ];
  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);

  const req = createReq({
    body: {
      titulo: 'Copa Invalida',
      cupos_max: 8,
      costo: 2000,
      fecha_inicio_inscripcion: '2026-07-01T10:00:00Z',
      fecha_cierre_inscripcion: '2026-07-05T10:00:00Z',
      fecha_inicio: '2026-07-06T10:00:00Z',
      fecha_fin: '2026-07-08T10:00:00Z',
      canchas_ids: [cancha1, cancha2],
    },
  });
  const res = createRes();

  await torneosController.crearTorneo(req, res);

  assert.equal(res.statusCode, 400);
  assert.match(res.payload.error, /no existen/i);
  assert.deepEqual(res.payload.missingIds, [cancha2]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].table, 'canchas');

  assertQueueEmpty();
});

test('crear torneo falla si alguna cancha asignada no esta disponible', async () => {
  const calls = [];
  const cancha1 = '11111111-1111-4111-8111-111111111111';
  const queue = [
    {
      data: [{ id: cancha1, esta_disponible: false }],
      error: null,
    },
  ];
  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);

  const req = createReq({
    body: {
      titulo: 'Copa Cancha Ocupada',
      cupos_max: 8,
      costo: 2000,
      fecha_inicio_inscripcion: '2026-07-01T10:00:00Z',
      fecha_cierre_inscripcion: '2026-07-05T10:00:00Z',
      fecha_inicio: '2026-07-06T10:00:00Z',
      fecha_fin: '2026-07-08T10:00:00Z',
      canchas_asignadas: [cancha1],
    },
  });
  const res = createRes();

  await torneosController.crearTorneo(req, res);

  assert.equal(res.statusCode, 400);
  assert.match(res.payload.error, /no estan disponibles/i);
  assert.deepEqual(res.payload.unavailableIds, [cancha1]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].table, 'canchas');

  assertQueueEmpty();
});

test('inscribir antes de inicio de inscripcion falla', async () => {
  const calls = [];
  const queue = [
    {
      data: {
        cupos_max: 16,
        estado: 'publicado',
        fecha_inicio: '2026-06-10T10:00:00Z',
        fecha_fin: '2026-06-20T10:00:00Z',
        fecha_inicio_inscripcion: '2999-01-01T00:00:00Z',
        fecha_cierre_inscripcion: '2999-01-10T00:00:00Z',
      },
      error: null,
    },
  ];
  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);

  const req = createReq({
    params: { torneoId: 'torneo_2' },
    body: {
      jugador_id: 'jugador_1',
      disponibilidad_inscripcion: [
        {
          fecha: '2026-06-12',
          dia_semana: 5,
          hora_inicio: '10:00',
          hora_fin: '11:30',
        },
      ],
    },
  });
  const res = createRes();

  await torneosController.inscribirJugador(req, res);

  assert.equal(res.statusCode, 409);
  assert.equal(res.payload.error, 'El periodo de inscripción para este torneo no está activo.');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].table, 'torneos');

  assertQueueEmpty();
});

test('inscribir despues de cierre falla', async () => {
  const calls = [];
  const queue = [
    {
      data: {
        cupos_max: 16,
        estado: 'publicado',
        fecha_inicio: '2026-06-10T10:00:00Z',
        fecha_fin: '2026-06-20T10:00:00Z',
        fecha_inicio_inscripcion: '2000-01-01T00:00:00Z',
        fecha_cierre_inscripcion: '2000-01-10T00:00:00Z',
      },
      error: null,
    },
  ];
  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);

  const req = createReq({
    params: { torneoId: 'torneo_2' },
    body: {
      jugador_id: 'jugador_1',
      disponibilidad: [
        {
          fecha: '2026-06-12',
          dia_semana: 5,
          hora_inicio: '10:00',
          hora_fin: '11:30',
        },
      ],
    },
  });
  const res = createRes();

  await torneosController.inscribirJugador(req, res);

  assert.equal(res.statusCode, 409);
  assert.equal(res.payload.error, 'El periodo de inscripción para este torneo no está activo.');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].table, 'torneos');

  assertQueueEmpty();
});

test('inscribir dentro de ventana guarda en disponibilidad_inscripcion y no en disponibilidad general', async () => {
  const calls = [];
  const queue = [
    {
      data: {
        cupos_max: 8,
        estado: 'publicado',
        fecha_inicio: '2026-06-10T10:00:00Z',
        fecha_fin: '2026-06-20T10:00:00Z',
        fecha_inicio_inscripcion: '2000-01-01T00:00:00Z',
        fecha_cierre_inscripcion: '2999-01-10T00:00:00Z',
      },
      error: null,
    },
    { count: 2, error: null },
    { data: { id: 'insc_1' }, error: null },
    { error: null },
    { error: null },
  ];
  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);

  const req = createReq({
    params: { torneoId: 'torneo_3' },
    body: {
      jugador_id: 'jugador_9',
      disponibilidad_inscripcion: [
        {
          fecha: '2026-06-12',
          dia_semana: 5,
          hora_inicio: '09:00',
          hora_fin: '10:30',
          es_obligatoria_fin_semana: true,
        },
      ],
    },
  });
  const res = createRes();

  await torneosController.inscribirJugador(req, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.payload.disponibilidad_guardada, 1);

  const disponibilidadInscripcionOps = calls.filter((c) => c.table === 'disponibilidad_inscripcion');
  assert.equal(disponibilidadInscripcionOps.length, 2);
  assert.equal(disponibilidadInscripcionOps[0].action, 'delete');
  assert.equal(disponibilidadInscripcionOps[1].action, 'insert');

  const writesToGeneralAvailability = calls.some(
    (c) => c.table === 'disponibilidad_jugador' && ['insert', 'update', 'delete'].includes(c.action)
  );
  assert.equal(writesToGeneralAvailability, false);

  assertQueueEmpty();
});

test('inscribir torneo en estado no inscribible falla con 409', async () => {
  const calls = [];
  const queue = [
    {
      data: {
        cupos_max: 8,
        estado: 'finalizado',
        fecha_inicio: '2026-06-10T10:00:00Z',
        fecha_fin: '2026-06-20T10:00:00Z',
        fecha_inicio_inscripcion: '2000-01-01T00:00:00Z',
        fecha_cierre_inscripcion: '2999-01-10T00:00:00Z',
      },
      error: null,
    },
  ];
  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);

  const req = createReq({
    params: { torneoId: 'torneo_4' },
    body: {
      jugador_id: 'jugador_10',
      disponibilidad_inscripcion: [
        {
          fecha: '2026-06-12',
          dia_semana: 5,
          hora_inicio: '09:00',
          hora_fin: '10:30',
        },
      ],
    },
  });
  const res = createRes();

  await torneosController.inscribirJugador(req, res);

  assert.equal(res.statusCode, 409);
  assert.equal(res.payload.error, 'El torneo no está publicado para inscripción.');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].table, 'torneos');

  assertQueueEmpty();
});

test('GET /api/torneos retorna todos e incluye finalizados', async () => {
  const calls = [];
  const queue = [
    {
      data: [
        {
          id: 't_finalizado',
          titulo: 'Master 2025',
          estado: 'finalizado',
          costo: 6000,
          cupos_max: 8,
          fecha_inicio: '2025-12-10T10:00:00Z',
          fecha_fin: '2025-12-15T10:00:00Z',
          fecha_inicio_inscripcion: '2025-11-01T10:00:00Z',
          fecha_cierre_inscripcion: '2025-12-01T10:00:00Z',
          inscripciones: [{ count: 8 }],
        },
        {
          id: 't_inscripcion',
          titulo: 'Apertura 2026',
          estado: 'inscripcion',
          costo: 4500,
          cupos_max: 16,
          fecha_inicio: '2026-03-12T10:00:00Z',
          fecha_fin: '2026-03-16T10:00:00Z',
          fecha_inicio_inscripcion: '2026-02-01T10:00:00Z',
          fecha_cierre_inscripcion: '2026-03-08T10:00:00Z',
          inscripciones: [{ count: 6 }],
        },
      ],
      error: null,
    },
  ];
  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);

  const req = createReq();
  const res = createRes();

  await torneosController.obtenerTodosLosTorneos(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(Array.isArray(res.payload), true);
  assert.equal(res.payload.length, 2);
  assert.equal(res.payload[0].estado, 'finalizado');
  assert.equal(res.payload[0].inscritos_count, 8);
  assert.equal(res.payload[0].fecha_inicio_inscripcion, '2025-11-01T10:00:00Z');
  assert.equal(res.payload[0].fecha_cierre_inscripcion, '2025-12-01T10:00:00Z');

  assert.equal(calls.length, 1);
  assert.equal(calls[0].table, 'torneos');
  assert.equal(calls[0].action, 'select');

  assertQueueEmpty();
});
