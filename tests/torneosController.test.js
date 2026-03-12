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
      modalidad: 'Singles',
      rama: 'Masculino',
      categoria_id: 3,
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
      modalidad: 'Singles',
      rama: 'Masculino',
      categoria_id: 3,
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
      modalidad: 'Singles',
      rama: 'Masculino',
      categoria_id: 3,
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

test('crear torneo falla si faltan modalidad/rama/categoria_id', async () => {
  const calls = [];
  const queue = [];
  mockSupabaseWithQueue(queue, calls);

  const req = createReq({
    body: {
      titulo: 'Copa Sin Requisitos',
      cupos_max: 8,
      costo: 3000,
      fecha_inicio_inscripcion: '2026-05-01T10:00:00Z',
      fecha_cierre_inscripcion: '2026-05-10T10:00:00Z',
      fecha_inicio: '2026-05-12T10:00:00Z',
      fecha_fin: '2026-05-15T18:00:00Z',
    },
  });
  const res = createRes();

  await torneosController.crearTorneo(req, res);

  assert.equal(res.statusCode, 400);
  assert.match(res.payload.error, /modalidad es obligatoria/i);
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
      modalidad: 'Singles',
      rama: 'Masculino',
      categoria_id: 3,
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
      modalidad: 'Singles',
      rama: 'Masculino',
      categoria_id: 3,
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
      modalidad: 'Singles',
      rama: 'Masculino',
      categoria_id: 3,
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
        modalidad: 'Singles',
        rama: 'Masculino',
        categoria_id: 3,
      },
      error: null,
    },
    {
      data: {
        id: 'jugador_9',
        sexo: 'Masculino',
        categoria_singles: 3,
      },
      error: null,
    },
    { data: null, error: { code: 'PGRST116', message: 'Not found' } },
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
  assert.equal(res.payload.estado_inscripcion, 'pendiente');
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

test('inscribir mantiene compatibilidad cuando faltan columnas nuevas en schema cache', async () => {
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
        modalidad: 'Singles',
        rama: 'Masculino',
        categoria_id: 3,
      },
      error: null,
    },
    {
      data: {
        id: 'jugador_compat',
        sexo: 'Masculino',
        categoria_singles: 3,
      },
      error: null,
    },
    {
      data: null,
      error: { code: 'PGRST204', message: "Could not find the 'estado_inscripcion' column of 'inscripciones' in the schema cache" },
    },
    {
      data: null,
      error: { code: 'PGRST116', message: 'Not found' },
    },
    {
      data: null,
      error: { code: 'PGRST204', message: "Could not find the 'estado_inscripcion' column of 'inscripciones' in the schema cache" },
    },
    {
      data: { id: 'insc_compat_1' },
      error: null,
    },
    { error: null },
    {
      error: { code: 'PGRST204', message: "Could not find the 'es_obligatoria_fin_semana' column of 'disponibilidad_inscripcion' in the schema cache" },
    },
    { error: null },
  ];
  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);

  const req = createReq({
    params: { torneoId: 'torneo_compat' },
    body: {
      jugador_id: 'jugador_compat',
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
  assert.equal(res.payload.estado_inscripcion, 'pendiente');

  const inscripcionesInserts = calls.filter((c) => c.table === 'inscripciones' && c.action === 'insert');
  assert.equal(inscripcionesInserts.length, 2);

  const disponibilidadInserts = calls.filter((c) => c.table === 'disponibilidad_inscripcion' && c.action === 'insert');
  assert.equal(disponibilidadInserts.length, 2);
  assert.equal(Object.prototype.hasOwnProperty.call(disponibilidadInserts[0].payload[0], 'es_obligatoria_fin_semana'), true);
  assert.equal(Object.prototype.hasOwnProperty.call(disponibilidadInserts[1].payload[0], 'es_obligatoria_fin_semana'), false);

  assertQueueEmpty();
});

test('admin obtiene plantilla global de WhatsApp desde configuracion_admin', async () => {
  const calls = [];
  const queue = [
    {
      data: {
        clave: 'inscripciones_whatsapp_template',
        valor: 'Hola {jugador}, tu solicitud para {torneo} esta en revision.',
        updated_at: '2026-03-12T04:00:00.000Z',
      },
      error: null,
    },
  ];

  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);
  const req = createReq();
  const res = createRes();

  await torneosController.getInscripcionesWhatsappTemplate(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.template, 'Hola {jugador}, tu solicitud para {torneo} esta en revision.');
  assert.equal(res.payload.source, 'database');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].table, 'configuracion_admin');

  assertQueueEmpty();
});

test('admin obtiene plantilla default cuando no existe configuracion guardada', async () => {
  const calls = [];
  const queue = [
    {
      data: null,
      error: { code: 'PGRST116', message: 'Not found' },
    },
  ];

  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);
  const req = createReq();
  const res = createRes();

  await torneosController.getInscripcionesWhatsappTemplate(req, res);

  assert.equal(res.statusCode, 200);
  assert.match(res.payload.template, /\{jugador\}/);
  assert.equal(res.payload.source, 'default');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].table, 'configuracion_admin');

  assertQueueEmpty();
});

test('admin actualiza plantilla global de WhatsApp', async () => {
  const calls = [];
  const queue = [
    {
      data: {
        clave: 'inscripciones_whatsapp_template',
        valor: 'Hola {jugador}, necesitamos confirmar tu disponibilidad para {torneo}.',
        updated_at: '2026-03-12T04:20:00.000Z',
      },
      error: null,
    },
  ];

  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);
  const req = createReq({
    body: {
      template: 'Hola {jugador}, necesitamos confirmar tu disponibilidad para {torneo}.',
    },
  });
  const res = createRes();

  await torneosController.updateInscripcionesWhatsappTemplate(req, res);

  assert.equal(res.statusCode, 200);
  assert.match(res.payload.template, /confirmar tu disponibilidad/i);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].table, 'configuracion_admin');
  assert.equal(calls[0].action, 'update');

  assertQueueEmpty();
});

test('inscribir falla si sexo o categoria no coinciden con requisitos del torneo', async () => {
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
        modalidad: 'Singles',
        rama: 'Masculino',
        categoria_id: 1,
      },
      error: null,
    },
    {
      data: {
        id: 'jugador_10',
        sexo: 'Femenino',
        categoria_singles: 3,
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
  assert.match(res.payload.error, /requisitos del torneo/i);

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

test('admin obtiene listado de inscripciones pendientes', async () => {
  const calls = [];
  const queue = [
    {
      data: [
        {
          id: '99999999-9999-4999-8999-999999999999',
          torneo_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          jugador_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          estado: 'pendiente',
          estado_inscripcion: 'pendiente',
          fecha_inscripcion: '2026-05-01T10:00:00.000Z',
          torneos: {
            id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            titulo: 'Copa Club',
          },
          perfiles: {
            id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            nombre_completo: 'Jugador Uno',
          },
        },
      ],
      error: null,
    },
  ];
  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);

  const req = createReq();
  const res = createRes();

  await torneosController.obtenerInscripcionesPendientesAdmin(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(Array.isArray(res.payload), true);
  assert.equal(res.payload.length, 1);
  assert.equal(res.payload[0].estado_inscripcion, 'pendiente');
  assert.equal(res.payload[0].torneo.titulo, 'Copa Club');

  assert.equal(calls.length, 1);
  assert.equal(calls[0].table, 'inscripciones');

  assertQueueEmpty();
});

test('admin aprueba una inscripcion pendiente respetando cupo', async () => {
  const calls = [];
  const torneoId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const inscripcionId = '99999999-9999-4999-8999-999999999999';
  const queue = [
    {
      data: {
        id: inscripcionId,
        torneo_id: torneoId,
        jugador_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        estado: 'pendiente',
        estado_inscripcion: 'pendiente',
        torneos: { cupos_max: 4, titulo: 'Copa Club' },
      },
      error: null,
    },
    {
      data: [
        { torneo_id: torneoId, estado_inscripcion: 'aprobada', estado: 'confirmada' },
        { torneo_id: torneoId, estado_inscripcion: 'pendiente', estado: 'pendiente' },
      ],
      error: null,
    },
    {
      data: {
        id: inscripcionId,
        torneo_id: torneoId,
        estado: 'confirmada',
        estado_inscripcion: 'aprobada',
      },
      error: null,
    },
  ];

  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);

  const req = createReq({
    params: { inscripcionId },
    body: { estado_inscripcion: 'aprobada' },
  });
  const res = createRes();

  await torneosController.validarInscripcionAdmin(req, res);

  assert.equal(res.statusCode, 200);
  assert.match(res.payload.message, /aprobada/i);
  assert.equal(res.payload.inscripcion.estado_inscripcion, 'aprobada');

  assert.equal(calls.length, 3);
  assert.equal(calls[0].table, 'inscripciones');
  assert.equal(calls[1].table, 'inscripciones');
  assert.equal(calls[2].action, 'update');
  assert.equal(calls[2].payload.estado, 'confirmada');

  assertQueueEmpty();
});

test('jugador obtiene sus estados de inscripcion por torneo', async () => {
  const calls = [];
  const jugadorId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const queue = [
    {
      data: [
        {
          id: '99999999-9999-4999-8999-999999999999',
          torneo_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          jugador_id: jugadorId,
          estado: 'pendiente',
          estado_inscripcion: 'pendiente',
          fecha_inscripcion: '2026-05-01T10:00:00.000Z',
        },
      ],
      error: null,
    },
  ];

  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);

  const req = createReq({ params: { id: jugadorId } });
  const res = createRes();

  await torneosController.obtenerInscripcionesPorJugador(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(Array.isArray(res.payload), true);
  assert.equal(res.payload[0].estado_inscripcion, 'pendiente');

  assert.equal(calls.length, 1);
  assert.equal(calls[0].table, 'inscripciones');

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
    {
      data: [
        { torneo_id: 't_finalizado', estado_inscripcion: 'aprobada', estado: 'confirmada' },
        { torneo_id: 't_finalizado', estado_inscripcion: 'aprobada', estado: 'confirmada' },
        { torneo_id: 't_inscripcion', estado_inscripcion: 'aprobada', estado: 'confirmada' },
        { torneo_id: 't_inscripcion', estado_inscripcion: 'pendiente', estado: 'pendiente' },
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
  assert.equal(res.payload[0].inscritos_count, 2);
  assert.equal(res.payload[0].solicitudes_pendientes, 0);
  assert.equal(res.payload[1].inscritos_count, 1);
  assert.equal(res.payload[1].solicitudes_pendientes, 1);
  assert.equal(res.payload[0].fecha_inicio_inscripcion, '2025-11-01T10:00:00Z');
  assert.equal(res.payload[0].fecha_cierre_inscripcion, '2025-12-01T10:00:00Z');

  assert.equal(calls.length, 2);
  assert.equal(calls[0].table, 'torneos');
  assert.equal(calls[0].action, 'select');
  assert.equal(calls[1].table, 'inscripciones');

  assertQueueEmpty();
});

test('obtenerCanchasDelTorneo retorna canchas asignadas', async () => {
  const calls = [];
  const torneoId = '80aa40d8-f99f-4ff3-af3b-75d621d6d137';
  const queue = [
    { data: { id: torneoId }, error: null },
    { data: [{ cancha_id: 'c1' }, { cancha_id: 'c2' }], error: null },
    {
      data: [
        { id: 'c1', nombre: 'Cancha 1', tipo_superficie: 'polvo', esta_disponible: true, descripcion: null },
        { id: 'c2', nombre: 'Cancha 2', tipo_superficie: 'sintetica', esta_disponible: true, descripcion: null },
      ],
      error: null,
    },
  ];
  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);

  const req = createReq({ params: { id: torneoId } });
  const res = createRes();

  await torneosController.obtenerCanchasDelTorneo(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(Array.isArray(res.payload), true);
  assert.equal(res.payload.length, 2);
  assert.equal(res.payload[0].id, 'c1');

  assertQueueEmpty();
});

test('obtenerCanchasDelTorneo sin canchas retorna []', async () => {
  const calls = [];
  const torneoId = '80aa40d8-f99f-4ff3-af3b-75d621d6d137';
  const queue = [
    { data: { id: torneoId }, error: null },
    { data: [], error: null },
  ];
  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);

  const req = createReq({ params: { id: torneoId } });
  const res = createRes();

  await torneosController.obtenerCanchasDelTorneo(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.payload, []);

  assertQueueEmpty();
});

test('actualizarEstadoTorneo actualiza estado valido', async () => {
  const calls = [];
  const torneoId = '80aa40d8-f99f-4ff3-af3b-75d621d6d137';
  const queue = [
    { data: { id: torneoId, estado: 'en_progreso' }, error: null },
  ];
  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);

  const req = createReq({ params: { id: torneoId }, body: { estado: 'en_progreso' } });
  const res = createRes();

  await torneosController.actualizarEstadoTorneo(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.torneo.estado, 'en_progreso');
  assertQueueEmpty();
});

test('actualizarEstadoTorneo aplica fallback para estado invalido', async () => {
  const calls = [];
  const torneoId = '80aa40d8-f99f-4ff3-af3b-75d621d6d137';
  const queue = [
    { data: { id: torneoId, estado: 'en_progreso' }, error: null },
  ];
  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);

  const req = createReq({
    params: { id: torneoId },
    body: { estado: 'desconocido' },
  });
  const res = createRes();

  await torneosController.actualizarEstadoTorneo(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.torneo.estado, 'en_progreso');
  assertQueueEmpty();
});

test('actualizarEstadoTorneo acepta key status con alias en_curso', async () => {
  const calls = [];
  const torneoId = '80aa40d8-f99f-4ff3-af3b-75d621d6d137';
  const queue = [
    { data: { id: torneoId, estado: 'en_progreso' }, error: null },
  ];
  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);

  const req = createReq({
    params: { id: torneoId },
    body: { status: 'en_curso' },
  });
  const res = createRes();

  await torneosController.actualizarEstadoTorneo(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.torneo.estado, 'en_progreso');
  assertQueueEmpty();
});

test('actualizarTorneoCompat con solo estado delega a actualizarEstadoTorneo', async () => {
  const calls = [];
  const torneoId = '80aa40d8-f99f-4ff3-af3b-75d621d6d137';
  const queue = [
    { data: { id: torneoId, estado: 'en_progreso' }, error: null },
  ];
  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);

  const req = createReq({ params: { id: torneoId }, body: { status: 'en_curso' } });
  const res = createRes();

  await torneosController.actualizarTorneoCompat(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.torneo.estado, 'en_progreso');
  assertQueueEmpty();
});

test('actualizarTorneoCompat con body vacio responde 200 sin cambios', async () => {
  const calls = [];
  const torneoId = '80aa40d8-f99f-4ff3-af3b-75d621d6d137';
  const queue = [];
  mockSupabaseWithQueue(queue, calls);

  const req = createReq({ params: { id: torneoId }, body: {} });
  const res = createRes();

  await torneosController.actualizarTorneoCompat(req, res);

  assert.equal(res.statusCode, 200);
  assert.match(res.payload.message, /sin cambios/i);
  assert.equal(calls.length, 0);
});

test('actualizarTorneoCompat con payload de partido responde 200 no-op compatible', async () => {
  const calls = [];
  const torneoId = '80aa40d8-f99f-4ff3-af3b-75d621d6d137';
  const queue = [];
  mockSupabaseWithQueue(queue, calls);

  const req = createReq({
    params: { id: torneoId },
    body: {
      estado_partido: 'finalizada',
      ganador: 'jugador1',
      score: '6-3 / 6-4',
      partidoId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    },
  });
  const res = createRes();

  await torneosController.actualizarTorneoCompat(req, res);

  assert.equal(res.statusCode, 200);
  assert.match(res.payload.message, /payload de partido/i);
  assert.equal(calls.length, 0);
});

test('obtenerEstadoCanchas retorna partido actual y proximo por cancha', async () => {
  const calls = [];
  const torneoId = '80aa40d8-f99f-4ff3-af3b-75d621d6d137';
  const cancha1 = '11111111-1111-4111-8111-111111111111';
  const cancha2 = '22222222-2222-4222-8222-222222222222';
  const jugador1 = '33333333-3333-4333-8333-333333333333';
  const jugador2 = '44444444-4444-4444-8444-444444444444';
  const jugador3 = '55555555-5555-4555-8555-555555555555';
  const jugador4 = '66666666-6666-4666-8666-666666666666';

  const queue = [
    { data: { id: torneoId, titulo: 'Copa Club', estado: 'en_progreso' }, error: null },
    { data: [{ cancha_id: cancha1 }, { cancha_id: cancha2 }], error: null },
    {
      data: [
        { id: cancha1, nombre: 'Cancha 1', tipo_superficie: 'polvo', esta_disponible: true },
        { id: cancha2, nombre: 'Cancha 2', tipo_superficie: 'sintetica', esta_disponible: true },
      ],
      error: null,
    },
    {
      data: [
        {
          id: 'p1',
          cancha_id: cancha1,
          fecha_hora: '2026-03-09T10:00:00.000Z',
          estado: 'en_juego',
          ronda: 'Semifinal',
          ronda_orden: 4,
          jugador1_id: jugador1,
          jugador2_id: jugador2,
        },
        {
          id: 'p2',
          cancha_id: cancha1,
          fecha_hora: '2026-03-09T12:00:00.000Z',
          estado: 'programado',
          ronda: 'Semifinal',
          ronda_orden: 4,
          jugador1_id: jugador3,
          jugador2_id: jugador4,
        },
        {
          id: 'p3',
          cancha_id: cancha2,
          fecha_hora: '2099-03-09T14:00:00.000Z',
          estado: 'programado',
          ronda: 'Final',
          ronda_orden: 2,
          jugador1_id: jugador1,
          jugador2_id: jugador3,
        },
      ],
      error: null,
    },
    {
      data: [
        { id: jugador1, nombre_completo: 'Jugador 1' },
        { id: jugador2, nombre_completo: 'Jugador 2' },
        { id: jugador3, nombre_completo: 'Jugador 3' },
        { id: jugador4, nombre_completo: 'Jugador 4' },
      ],
      error: null,
    },
  ];

  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);

  const req = createReq({ params: { id: torneoId } });
  const res = createRes();

  await torneosController.obtenerEstadoCanchas(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.torneo.id, torneoId);
  assert.equal(Array.isArray(res.payload.canchas), true);
  assert.equal(res.payload.canchas.length, 2);

  const cancha1Estado = res.payload.canchas.find((c) => c.cancha.id === cancha1);
  assert.ok(cancha1Estado);
  assert.equal(cancha1Estado.estado_cancha, 'ocupada');
  assert.equal(cancha1Estado.partido_actual.id, 'p1');
  assert.equal(cancha1Estado.proximo_partido.id, 'p2');
  assert.equal(cancha1Estado.partido_actual.jugador1.nombre_completo, 'Jugador 1');

  const cancha2Estado = res.payload.canchas.find((c) => c.cancha.id === cancha2);
  assert.ok(cancha2Estado);
  assert.equal(cancha2Estado.estado_cancha, 'libre');
  assert.equal(cancha2Estado.partido_actual, null);
  assert.equal(cancha2Estado.proximo_partido.id, 'p3');

  assertQueueEmpty();
});

test('obtenerEstadoCanchas devuelve canchas vacias cuando torneo no tiene asignaciones', async () => {
  const calls = [];
  const torneoId = '80aa40d8-f99f-4ff3-af3b-75d621d6d137';

  const queue = [
    { data: { id: torneoId, titulo: 'Copa Club', estado: 'publicado' }, error: null },
    { data: [], error: null },
  ];

  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);

  const req = createReq({ params: { id: torneoId } });
  const res = createRes();

  await torneosController.obtenerEstadoCanchas(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(Array.isArray(res.payload.canchas), true);
  assert.equal(res.payload.canchas.length, 0);

  assertQueueEmpty();
});
