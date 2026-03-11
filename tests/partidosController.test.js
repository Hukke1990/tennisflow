const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const supabase = require('../services/supabase');
const partidosController = require('../controllers/partidosController');

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

      return queue.shift();
    };

    return {
      select(columns) {
        if (!state.action) state.action = 'select';
        state.selectArgs = { columns };
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
      eq(column, value) {
        state.filters.push({ op: 'eq', column, value });
        return this;
      },
      in(column, values) {
        state.filters.push({ op: 'in', column, values });
        return this;
      },
      order() {
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

test('actualizarProgramacion actualiza fecha_hora y cancha_id', async () => {
  const calls = [];
  const partidoId = '80aa40d8-f99f-4ff3-af3b-75d621d6d137';
  const canchaId = '11111111-1111-4111-8111-111111111111';

  const queue = [
    { data: { id: partidoId, estado: 'programado' }, error: null },
    {
      data: {
        id: partidoId,
        fecha_hora: '2026-03-09T12:00:00.000Z',
        cancha_id: canchaId,
        estado: 'programado',
      },
      error: null,
    },
  ];

  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);

  const req = createReq({
    params: { id: partidoId },
    body: {
      fecha_hora: '2026-03-09T12:00:00Z',
      cancha_id: canchaId,
    },
  });
  const res = createRes();

  await partidosController.actualizarProgramacion(req, res);

  assert.equal(res.statusCode, 200);
  assert.match(res.payload.message, /Programacion del partido actualizada/i);

  const updateCall = calls.find((c) => c.table === 'partidos' && c.action === 'update');
  assert.ok(updateCall);
  assert.equal(updateCall.payload.cancha_id, canchaId);
  assert.equal(updateCall.payload.fecha_hora, '2026-03-09T12:00:00.000Z');

  assertQueueEmpty();
});

test('actualizarProgramacion con endpoint horario acepta fecha+hora', async () => {
  const calls = [];
  const partidoId = '80aa40d8-f99f-4ff3-af3b-75d621d6d137';

  const queue = [
    { data: { id: partidoId, estado: 'programado' }, error: null },
    {
      data: { id: partidoId, fecha_hora: '2026-03-10T09:00:00.000Z', cancha_id: null, estado: 'programado' },
      error: null,
    },
  ];

  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);

  const req = createReq({
    params: { id: partidoId },
    body: { fecha: '2026-03-10', hora: '09:00:00' },
  });
  const res = createRes();

  await partidosController.actualizarHorario(req, res);

  assert.equal(res.statusCode, 200);
  assertQueueEmpty();
});

test('actualizarProgramacion valida payload incompleto', async () => {
  const calls = [];
  const req = createReq({
    params: { id: '80aa40d8-f99f-4ff3-af3b-75d621d6d137' },
    body: {},
  });
  const res = createRes();

  await partidosController.reprogramarPartido(req, res);

  assert.equal(res.statusCode, 400);
  assert.match(res.payload.error, /fecha_hora\/horario/i);
  assert.equal(calls.length, 0);
});

test('cargarResultado impacta ranking por modalidad Singles al finalizar partido', async () => {
  const calls = [];
  const partidoId = '80aa40d8-f99f-4ff3-af3b-75d621d6d137';
  const torneoId = '11111111-1111-4111-8111-111111111111';

  const queue = [
    {
      data: {
        id: partidoId,
        torneo_id: torneoId,
        ronda_orden: 2,
        jugador1_id: 'j1',
        jugador2_id: 'j2',
        ganador_id: null,
      },
      error: null,
    },
    {
      data: {
        id: partidoId,
        torneo_id: torneoId,
        estado: 'finalizado',
        ganador_id: 'j1',
      },
      error: null,
    },
    { data: { id: torneoId, modalidad: 'Singles', rama: 'Masculino', categoria_id: 3 }, error: null },
    {
      data: [
        { id: 'j1', sexo: 'Masculino', categoria_singles: 3, ranking_elo_singles: 1500 },
        { id: 'j2', sexo: 'Masculino', categoria_singles: 3, ranking_elo_singles: 1400 },
      ],
      error: null,
    },
    { error: null },
    { error: null },
    { error: null },
  ];

  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);

  const req = createReq({ params: { id: partidoId }, body: { ganador_id: 'j1' } });
  const res = createRes();

  await partidosController.cargarResultado(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.ranking_impact.applied, true);
  assert.equal(res.payload.ranking_impact.ranking_field_ganador, 'ranking_elo_singles');
  assert.equal(res.payload.ranking_impact.ganador.after, 1512);
  assert.equal(res.payload.ranking_impact.perdedor.after, 1388);

  assertQueueEmpty();
});

test('empezarPartido cambia estado a en_juego y define inicio_real', async () => {
  const calls = [];
  const partidoId = '80aa40d8-f99f-4ff3-af3b-75d621d6d137';

  const queue = [
    { data: { id: partidoId, estado: 'programado', inicio_real: null }, error: null },
    {
      data: {
        id: partidoId,
        torneo_id: '11111111-1111-4111-8111-111111111111',
        estado: 'en_juego',
        inicio_real: '2026-03-09T10:00:00.000Z',
        ultima_actualizacion: '2026-03-09T10:00:00.000Z',
        fecha_hora: '2026-03-09T10:00:00.000Z',
        cancha_id: '11111111-1111-4111-8111-111111111111',
      },
      error: null,
    },
  ];

  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);

  const req = createReq({ params: { id: partidoId } });
  const res = createRes();

  await partidosController.empezarPartido(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.partido.estado, 'en_juego');

  const updateCall = calls.find((c) => c.table === 'partidos' && c.action === 'update');
  assert.ok(updateCall);
  assert.equal(updateCall.payload.estado, 'en_juego');
  assert.equal(typeof updateCall.payload.inicio_real, 'string');
  assert.equal(typeof updateCall.payload.ultima_actualizacion, 'string');

  assertQueueEmpty();
});

test('actualizarMarcadorEnVivo guarda marcador y timestamp', async () => {
  const calls = [];
  const partidoId = '80aa40d8-f99f-4ff3-af3b-75d621d6d137';
  const marcador = { sets: [{ j1: 6, j2: 4 }], game_actual: '30-15' };

  const queue = [
    { data: { id: partidoId, estado: 'en_juego' }, error: null },
    {
      data: {
        id: partidoId,
        torneo_id: '11111111-1111-4111-8111-111111111111',
        estado: 'en_juego',
        marcador_en_vivo: marcador,
        ultima_actualizacion: '2026-03-09T10:05:00.000Z',
        fecha_hora: '2026-03-09T10:00:00.000Z',
        cancha_id: '11111111-1111-4111-8111-111111111111',
      },
      error: null,
    },
  ];

  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);

  const req = createReq({ params: { id: partidoId }, body: { marcador_en_vivo: marcador } });
  const res = createRes();

  await partidosController.actualizarMarcadorEnVivo(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.payload.partido.marcador_en_vivo, marcador);

  const updateCall = calls.find((c) => c.table === 'partidos' && c.action === 'update');
  assert.ok(updateCall);
  assert.deepEqual(updateCall.payload.marcador_en_vivo, marcador);
  assert.equal(typeof updateCall.payload.ultima_actualizacion, 'string');

  assertQueueEmpty();
});

test('actualizarMarcadorEnVivo valida marcador requerido', async () => {
  const calls = [];
  const req = createReq({
    params: { id: '80aa40d8-f99f-4ff3-af3b-75d621d6d137' },
    body: {},
  });
  const res = createRes();

  await partidosController.actualizarMarcadorEnVivo(req, res);

  assert.equal(res.statusCode, 400);
  assert.match(res.payload.error, /marcador_en_vivo/i);
  assert.equal(calls.length, 0);
});

test('actualizarPartidoEnVivo con estado en_juego inicia partido', async () => {
  const calls = [];
  const partidoId = '80aa40d8-f99f-4ff3-af3b-75d621d6d137';

  const queue = [
    { data: { id: partidoId, estado: 'programado', inicio_real: null }, error: null },
    {
      data: {
        id: partidoId,
        torneo_id: '11111111-1111-4111-8111-111111111111',
        estado: 'en_juego',
        inicio_real: '2026-03-09T10:00:00.000Z',
        ultima_actualizacion: '2026-03-09T10:00:00.000Z',
        fecha_hora: '2026-03-09T10:00:00.000Z',
        cancha_id: '11111111-1111-4111-8111-111111111111',
      },
      error: null,
    },
  ];

  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);

  const req = createReq({ params: { id: partidoId }, body: { status: 'iniciar' } });
  const res = createRes();

  await partidosController.actualizarPartidoEnVivo(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.partido.estado, 'en_juego');
  assertQueueEmpty();
});

test('actualizarPartidoEnVivo con winner_id delega a cargarResultado', async () => {
  const calls = [];
  const partidoId = '80aa40d8-f99f-4ff3-af3b-75d621d6d137';
  const torneoId = '11111111-1111-4111-8111-111111111111';

  const queue = [
    {
      data: {
        id: partidoId,
        torneo_id: torneoId,
        ronda_orden: 2,
        jugador1_id: 'j1',
        jugador2_id: 'j2',
        ganador_id: null,
      },
      error: null,
    },
    {
      data: {
        id: partidoId,
        torneo_id: torneoId,
        estado: 'finalizado',
        ganador_id: 'j1',
      },
      error: null,
    },
    { data: { id: torneoId, modalidad: 'Singles', rama: 'Masculino', categoria_id: 3 }, error: null },
    {
      data: [
        { id: 'j1', sexo: 'Masculino', categoria_singles: 3, ranking_elo_singles: 1500 },
        { id: 'j2', sexo: 'Masculino', categoria_singles: 3, ranking_elo_singles: 1400 },
      ],
      error: null,
    },
    { error: null },
    { error: null },
    { error: null },
  ];

  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);

  const req = createReq({ params: { id: partidoId }, body: { winner_id: 'j1' } });
  const res = createRes();

  await partidosController.actualizarPartidoEnVivo(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.ranking_impact.applied, true);
  assertQueueEmpty();
});

test('cargarResultado falla con 400 si no llega ganador_id en eliminacion directa', async () => {
  const calls = [];
  const partidoId = '80aa40d8-f99f-4ff3-af3b-75d621d6d137';
  const queue = [
    {
      data: {
        id: partidoId,
        torneo_id: '11111111-1111-4111-8111-111111111111',
        ronda_orden: 8,
        estado: 'programado',
        jugador1_id: 'j1',
        jugador2_id: 'j2',
        ganador_id: null,
      },
      error: null,
    },
  ];
  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);

  const req = createReq({
    params: { id: partidoId },
    body: { finalizar: true, estado: 'finalizado' },
  });
  const res = createRes();

  await partidosController.cargarResultado(req, res);

  assert.equal(res.statusCode, 400);
  assert.match(res.payload.error, /ganador_id/i);
  assert.equal(calls.length, 1);
  assertQueueEmpty();
});

test('cargarResultado propaga ganador al slot correcto en siguiente ronda y persiste score', async () => {
  const calls = [];
  const partidoId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const torneoId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  const queue = [
    {
      data: {
        id: partidoId,
        torneo_id: torneoId,
        ronda_orden: 8,
        orden_en_ronda: 1,
        estado: 'en_juego',
        jugador1_id: 'j1',
        jugador2_id: 'j2',
        ganador_id: null,
      },
      error: null,
    },
    {
      data: {
        id: partidoId,
        torneo_id: torneoId,
        ronda_orden: 8,
        estado: 'finalizado',
        ganador_id: 'j1',
        score: '6-4 6-3',
      },
      error: null,
    },
    { data: { id: torneoId, modalidad: 'Singles', rama: 'Masculino', categoria_id: 3 }, error: null },
    {
      data: [
        { id: 'j1', sexo: 'Masculino', categoria_singles: 3, ranking_elo_singles: 1500 },
        { id: 'j2', sexo: 'Masculino', categoria_singles: 3, ranking_elo_singles: 1400 },
      ],
      error: null,
    },
    { error: null },
    { error: null },
    {
      data: [
        { id: partidoId, orden_en_ronda: 1, jugador1_id: 'j1', jugador2_id: 'j2', ganador_id: 'j1' },
        { id: 'q2', orden_en_ronda: 2, jugador1_id: 'j3', jugador2_id: 'j4', ganador_id: null },
      ],
      error: null,
    },
    {
      data: [
        { id: 's1', orden_en_ronda: 1, jugador1_id: null, jugador2_id: null, estado: 'programado' },
        { id: 's2', orden_en_ronda: 2, jugador1_id: null, jugador2_id: null, estado: 'programado' },
      ],
      error: null,
    },
    {
      data: {
        id: 's1',
        ronda_orden: 4,
        jugador1_id: 'j1',
        jugador2_id: null,
        estado: 'programado',
      },
      error: null,
    },
  ];

  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);

  const req = createReq({
    params: { id: partidoId },
    body: { ganador_id: 'j1', score: '6-4 6-3', resultado: { sets: [[6, 4], [6, 3]] }, finalizar: true },
  });
  const res = createRes();

  await partidosController.cargarResultado(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.partido.score, '6-4 6-3');
  assert.equal(res.payload.siguiente_partido.id, 's1');

  const updateSemifinal = calls.find((c) => c.table === 'partidos' && c.action === 'update' && c.filters.some((f) => f.column === 'id' && f.value === 's1'));
  assert.ok(updateSemifinal);
  assert.equal(updateSemifinal.payload.jugador1_id, 'j1');

  assertQueueEmpty();
});

test('cargarResultado usa orden_en_ronda como fallback si no encuentra el partido en la ronda actual', async () => {
  const calls = [];
  const partidoId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const torneoId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  const queue = [
    {
      data: {
        id: partidoId,
        torneo_id: torneoId,
        ronda_orden: 8,
        orden_en_ronda: 3,
        estado: 'en_juego',
        jugador1_id: 'j1',
        jugador2_id: 'j2',
        ganador_id: null,
      },
      error: null,
    },
    {
      data: {
        id: partidoId,
        torneo_id: torneoId,
        ronda_orden: 8,
        estado: 'finalizado',
        ganador_id: 'j1',
        score: '6-4 6-3',
      },
      error: null,
    },
    { data: { id: torneoId, modalidad: 'Singles', rama: 'Masculino', categoria_id: 3 }, error: null },
    {
      data: [
        { id: 'j1', sexo: 'Masculino', categoria_singles: 3, ranking_elo_singles: 1500 },
        { id: 'j2', sexo: 'Masculino', categoria_singles: 3, ranking_elo_singles: 1400 },
      ],
      error: null,
    },
    { error: null },
    { error: null },
    {
      data: [
        { id: 'q1', orden_en_ronda: 1, jugador1_id: 'j9', jugador2_id: 'j8', ganador_id: null },
        { id: 'q2', orden_en_ronda: 2, jugador1_id: 'j7', jugador2_id: 'j6', ganador_id: null },
      ],
      error: null,
    },
    {
      data: [
        { id: 's1', orden_en_ronda: 1, jugador1_id: null, jugador2_id: null, estado: 'programado' },
        { id: 's2', orden_en_ronda: 2, jugador1_id: null, jugador2_id: null, estado: 'programado' },
      ],
      error: null,
    },
    {
      data: {
        id: 's2',
        ronda_orden: 4,
        jugador1_id: 'j1',
        jugador2_id: null,
        estado: 'programado',
      },
      error: null,
    },
  ];

  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);

  const req = createReq({
    params: { id: partidoId },
    body: { ganador_id: 'j1', score: '6-4 6-3', finalizar: true },
  });
  const res = createRes();

  await partidosController.cargarResultado(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.siguiente_partido.id, 's2');

  const updateSemifinal = calls.find((c) => c.table === 'partidos' && c.action === 'update' && c.filters.some((f) => f.column === 'id' && f.value === 's2'));
  assert.ok(updateSemifinal);
  assert.equal(updateSemifinal.payload.jugador1_id, 'j1');

  assertQueueEmpty();
});

test('cargarResultado respeta orden_en_ronda aunque llegue como string al propagar', async () => {
  const calls = [];
  const partidoId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const torneoId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  const queue = [
    {
      data: {
        id: partidoId,
        torneo_id: torneoId,
        ronda_orden: 8,
        orden_en_ronda: '3',
        estado: 'programado',
        jugador1_id: 'j1',
        jugador2_id: 'j2',
        ganador_id: null,
      },
      error: null,
    },
    {
      data: {
        id: partidoId,
        torneo_id: torneoId,
        ronda_orden: 8,
        estado: 'finalizado',
        ganador_id: 'j1',
      },
      error: null,
    },
    { data: { id: torneoId, modalidad: 'Singles', rama: 'Masculino', categoria_id: 3 }, error: null },
    {
      data: [
        { id: 'j1', sexo: 'Masculino', categoria_singles: 3, ranking_elo_singles: 1500 },
        { id: 'j2', sexo: 'Masculino', categoria_singles: 3, ranking_elo_singles: 1400 },
      ],
      error: null,
    },
    { error: null },
    { error: null },
    {
      data: [
        { id: '11111111-1111-4111-8111-111111111111', orden_en_ronda: '1', ganador_id: null },
        { id: '22222222-2222-4222-8222-222222222222', orden_en_ronda: '2', ganador_id: null },
        { id: partidoId, orden_en_ronda: '3', ganador_id: 'j1' },
        { id: '33333333-3333-4333-8333-333333333333', orden_en_ronda: '4', ganador_id: null },
      ],
      error: null,
    },
    {
      data: [
        { id: 's1', orden_en_ronda: 1, jugador1_id: null, jugador2_id: null, estado: 'programado' },
        { id: 's2', orden_en_ronda: 2, jugador1_id: null, jugador2_id: null, estado: 'programado' },
      ],
      error: null,
    },
    {
      data: {
        id: 's2',
        ronda_orden: 4,
        jugador1_id: 'j1',
        jugador2_id: null,
        estado: 'programado',
      },
      error: null,
    },
  ];

  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);

  const req = createReq({
    params: { id: partidoId },
    body: { ganador_id: 'j1', finalizar: true },
  });
  const res = createRes();

  await partidosController.cargarResultado(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.siguiente_partido.id, 's2');

  const updateSemifinal = calls.find((c) => c.table === 'partidos' && c.action === 'update' && c.filters.some((f) => f.column === 'id' && f.value === 's2'));
  assert.ok(updateSemifinal);
  assert.equal(updateSemifinal.payload.jugador1_id, 'j1');

  assertQueueEmpty();
});

test('cargarResultado hidrata jugadores desde origen antes de validar ganador', async () => {
  const calls = [];
  const partidoId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const torneoId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  const queue = [
    {
      data: {
        id: partidoId,
        torneo_id: torneoId,
        ronda_orden: 2,
        estado: 'programado',
        jugador1_id: null,
        jugador2_id: null,
        jugador1_origen_partido_id: 'q1',
        jugador2_origen_partido_id: 'q2',
        ganador_id: null,
      },
      error: null,
    },
    {
      data: {
        id: 'q1',
        torneo_id: torneoId,
        ganador_id: 'j1',
      },
      error: null,
    },
    {
      data: {
        id: 'q2',
        torneo_id: torneoId,
        ganador_id: 'j2',
      },
      error: null,
    },
    {
      data: {
        id: partidoId,
        torneo_id: torneoId,
        ronda_orden: 2,
        estado: 'programado',
        jugador1_id: 'j1',
        jugador2_id: 'j2',
        ganador_id: null,
      },
      error: null,
    },
    {
      data: {
        id: partidoId,
        torneo_id: torneoId,
        ronda_orden: 2,
        estado: 'finalizado',
        jugador1_id: 'j1',
        jugador2_id: 'j2',
        ganador_id: 'j1',
        score: '6-4 6-2',
      },
      error: null,
    },
    { data: { id: torneoId, modalidad: 'Singles', rama: 'Masculino', categoria_id: 3 }, error: null },
    {
      data: [
        { id: 'j1', sexo: 'Masculino', categoria_singles: 3, ranking_elo_singles: 1500 },
        { id: 'j2', sexo: 'Masculino', categoria_singles: 3, ranking_elo_singles: 1400 },
      ],
      error: null,
    },
    { error: null },
    { error: null },
    { error: null },
  ];

  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);

  const req = createReq({
    params: { id: partidoId },
    body: { ganador_id: 'j1', score: '6-4 6-2', finalizar: true },
  });
  const res = createRes();

  await partidosController.cargarResultado(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.partido.ganador_id, 'j1');

  const hydrationUpdate = calls.find((c) => c.table === 'partidos' && c.action === 'update' && c.payload?.jugador1_id === 'j1' && c.payload?.jugador2_id === 'j2');
  assert.ok(hydrationUpdate);

  assertQueueEmpty();
});

test('cargarResultado hidrata jugadores desde ronda previa cuando faltan en semifinal/final', async () => {
  const calls = [];
  const partidoId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const torneoId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  const queue = [
    {
      data: {
        id: partidoId,
        torneo_id: torneoId,
        ronda_orden: 4,
        orden_en_ronda: 1,
        estado: 'programado',
        jugador1_id: null,
        jugador2_id: null,
        ganador_id: null,
      },
      error: null,
    },
    {
      data: [
        { id: partidoId, ronda_orden: 4, orden_en_ronda: 1, ganador_id: null },
      ],
      error: null,
    },
    {
      data: [
        { id: 'q1', ronda_orden: 8, orden_en_ronda: 1, ganador_id: 'j1' },
        { id: 'q2', ronda_orden: 8, orden_en_ronda: 2, ganador_id: 'j2' },
      ],
      error: null,
    },
    {
      data: {
        id: partidoId,
        torneo_id: torneoId,
        ronda_orden: 4,
        estado: 'programado',
        jugador1_id: 'j1',
        jugador2_id: 'j2',
        ganador_id: null,
      },
      error: null,
    },
    {
      data: {
        id: partidoId,
        torneo_id: torneoId,
        ronda_orden: 4,
        estado: 'finalizado',
        jugador1_id: 'j1',
        jugador2_id: 'j2',
        ganador_id: 'j1',
      },
      error: null,
    },
    { data: { id: torneoId, modalidad: 'Singles', rama: 'Masculino', categoria_id: 3 }, error: null },
    {
      data: [
        { id: 'j1', sexo: 'Masculino', categoria_singles: 3, ranking_elo_singles: 1500 },
        { id: 'j2', sexo: 'Masculino', categoria_singles: 3, ranking_elo_singles: 1400 },
      ],
      error: null,
    },
    { error: null },
    { error: null },
    {
      data: [
        { id: partidoId, orden_en_ronda: 1, jugador1_id: 'j1', jugador2_id: 'j2', ganador_id: 'j1' },
      ],
      error: null,
    },
    {
      data: [
        { id: 's1', orden_en_ronda: 1, jugador1_id: null, jugador2_id: null, estado: 'programado' },
      ],
      error: null,
    },
    {
      data: {
        id: 's1',
        ronda_orden: 2,
        jugador1_id: 'j1',
        jugador2_id: null,
        estado: 'programado',
      },
      error: null,
    },
  ];

  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);

  const req = createReq({
    params: { id: partidoId },
    body: { ganador_id: 'j1', score: '6-4 6-2', finalizar: true },
  });
  const res = createRes();

  await partidosController.cargarResultado(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.partido.ganador_id, 'j1');

  const hydrationUpdate = calls.find((c) => c.table === 'partidos' && c.action === 'update' && c.payload?.jugador1_id === 'j1' && c.payload?.jugador2_id === 'j2');
  assert.ok(hydrationUpdate);

  assertQueueEmpty();
});

test('cargarResultado idempotente: si ya estaba finalizado responde 200 y actualiza score', async () => {
  const calls = [];
  const partidoId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const torneoId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  const queue = [
    {
      data: {
        id: partidoId,
        torneo_id: torneoId,
        ronda_orden: 8,
        estado: 'finalizado',
        jugador1_id: 'j1',
        jugador2_id: 'j2',
        ganador_id: 'j1',
      },
      error: null,
    },
    {
      data: {
        id: partidoId,
        torneo_id: torneoId,
        estado: 'finalizado',
        ganador_id: 'j1',
        score: '6-0 6-0',
      },
      error: null,
    },
  ];

  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);

  const req = createReq({
    params: { id: partidoId },
    body: { ganador_id: 'j1', score: '6-0 6-0', finalizar: true },
  });
  const res = createRes();

  await partidosController.cargarResultado(req, res);

  assert.equal(res.statusCode, 200);
  assert.match(res.payload.message, /ya cargado previamente/i);
  assert.equal(res.payload.partido.score, '6-0 6-0');

  const updateCall = calls.find((c) => c.table === 'partidos' && c.action === 'update');
  assert.ok(updateCall);
  assert.equal(updateCall.payload.score, '6-0 6-0');
  assert.equal(updateCall.payload.marcador_en_vivo.score, '6-0 6-0');
  assert.equal(updateCall.payload.marcador_en_vivo.ganador_id, 'j1');

  assertQueueEmpty();
});

test('cargarResultado permite corregir finalizado con ganador inconsistente', async () => {
  const calls = [];
  const partidoId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const torneoId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  const queue = [
    {
      data: {
        id: partidoId,
        torneo_id: torneoId,
        ronda_orden: 2,
        estado: 'finalizado',
        jugador1_id: 'j1',
        jugador2_id: 'j2',
        ganador_id: 'jX',
      },
      error: null,
    },
    {
      data: {
        id: partidoId,
        torneo_id: torneoId,
        estado: 'finalizado',
        jugador1_id: 'j1',
        jugador2_id: 'j2',
        ganador_id: 'j2',
      },
      error: null,
    },
    { data: { id: torneoId, modalidad: 'Singles', rama: 'Masculino', categoria_id: 3 }, error: null },
    {
      data: [
        { id: 'j2', sexo: 'Masculino', categoria_singles: 3, ranking_elo_singles: 1500 },
        { id: 'j1', sexo: 'Masculino', categoria_singles: 3, ranking_elo_singles: 1400 },
      ],
      error: null,
    },
    { error: null },
    { error: null },
    { error: null },
  ];

  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);

  const req = createReq({
    params: { id: partidoId },
    body: { ganador_id: 'j2', score: '6-2 6-2', finalizar: true },
  });
  const res = createRes();

  await partidosController.cargarResultado(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.partido.ganador_id, 'j2');

  assertQueueEmpty();
});

test('cargarResultado permite override forzado en finalizado con otro ganador', async () => {
  const calls = [];
  const partidoId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const torneoId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  const queue = [
    {
      data: {
        id: partidoId,
        torneo_id: torneoId,
        ronda_orden: 2,
        estado: 'finalizado',
        jugador1_id: 'j1',
        jugador2_id: 'j2',
        ganador_id: 'j1',
      },
      error: null,
    },
    {
      data: {
        id: partidoId,
        torneo_id: torneoId,
        estado: 'finalizado',
        jugador1_id: 'j1',
        jugador2_id: 'j2',
        ganador_id: 'j2',
      },
      error: null,
    },
    { data: { id: torneoId, modalidad: 'Singles', rama: 'Masculino', categoria_id: 3 }, error: null },
    {
      data: [
        { id: 'j2', sexo: 'Masculino', categoria_singles: 3, ranking_elo_singles: 1500 },
        { id: 'j1', sexo: 'Masculino', categoria_singles: 3, ranking_elo_singles: 1400 },
      ],
      error: null,
    },
    { error: null },
    { error: null },
    { error: null },
  ];

  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);

  const req = createReq({
    params: { id: partidoId },
    body: { ganador_id: 'j2', score: '6-2 6-2', finalizar: true, forzar: true },
  });
  const res = createRes();

  await partidosController.cargarResultado(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.partido.ganador_id, 'j2');

  assertQueueEmpty();
});

test('cargarResultado idempotente sin score/resultado no fuerza update y responde 200', async () => {
  const calls = [];
  const partidoId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const torneoId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  const queue = [
    {
      data: {
        id: partidoId,
        torneo_id: torneoId,
        ronda_orden: 8,
        estado: 'finalizado',
        jugador1_id: 'j1',
        jugador2_id: 'j2',
        ganador_id: 'j1',
      },
      error: null,
    },
  ];

  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);

  const req = createReq({
    params: { id: partidoId },
    body: { ganador_id: 'j1', finalizar: true },
  });
  const res = createRes();

  await partidosController.cargarResultado(req, res);

  assert.equal(res.statusCode, 200);
  assert.match(res.payload.message, /ya cargado previamente/i);
  assert.equal(calls.length, 1);

  assertQueueEmpty();
});

test('cargarResultado fallback concurrente: error interno pero estado finalizado retorna 200', async () => {
  const calls = [];
  const partidoId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const torneoId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  const queue = [
    {
      data: {
        id: partidoId,
        torneo_id: torneoId,
        ronda_orden: 8,
        estado: 'programado',
        jugador1_id: 'j1',
        jugador2_id: 'j2',
        ganador_id: null,
      },
      error: null,
    },
    { data: null, error: { message: 'error forzado' } },
    { data: null, error: { message: 'error fallback minimo' } },
    {
      data: {
        id: partidoId,
        torneo_id: torneoId,
        estado: 'finalizado',
        ganador_id: 'j1',
      },
      error: null,
    },
  ];

  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);

  const req = createReq({
    params: { id: partidoId },
    body: { ganador_id: 'j1', finalizar: true },
  });
  const res = createRes();

  await partidosController.cargarResultado(req, res);

  assert.equal(res.statusCode, 200);
  assert.match(res.payload.message, /persistido en intento concurrente/i);

  assertQueueEmpty();
});

test('cargarResultado usa fallback minimo cuando falla update completo', async () => {
  const calls = [];
  const partidoId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const torneoId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  const queue = [
    {
      data: {
        id: partidoId,
        torneo_id: torneoId,
        ronda_orden: 2,
        estado: 'programado',
        jugador1_id: 'j1',
        jugador2_id: 'j2',
        ganador_id: null,
      },
      error: null,
    },
    { data: null, error: { message: 'error update completo' } },
    {
      data: {
        id: partidoId,
        torneo_id: torneoId,
        estado: 'finalizado',
        ganador_id: 'j1',
      },
      error: null,
    },
    { data: { id: torneoId, modalidad: 'Singles', rama: 'Masculino', categoria_id: 3 }, error: null },
    {
      data: [
        { id: 'j1', sexo: 'Masculino', categoria_singles: 3, ranking_elo_singles: 1500 },
        { id: 'j2', sexo: 'Masculino', categoria_singles: 3, ranking_elo_singles: 1400 },
      ],
      error: null,
    },
    { error: null },
    { error: null },
    { error: null },
  ];

  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);

  const req = createReq({
    params: { id: partidoId },
    body: { ganador_id: 'j1', score: '6-4 6-3', finalizar: true },
  });
  const res = createRes();

  await partidosController.cargarResultado(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.partido.ganador_id, 'j1');

  assertQueueEmpty();
});

test('actualizarPartidoEnVivo reconoce estado_partido + finalizar', async () => {
  const calls = [];
  const partidoId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const torneoId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  const queue = [
    {
      data: {
        id: partidoId,
        torneo_id: torneoId,
        ronda_orden: 8,
        estado: 'programado',
        jugador1_id: 'j1',
        jugador2_id: 'j2',
        ganador_id: null,
      },
      error: null,
    },
    {
      data: {
        id: partidoId,
        torneo_id: torneoId,
        ronda_orden: 8,
        estado: 'finalizado',
        ganador_id: 'j1',
      },
      error: null,
    },
    { data: { id: torneoId, modalidad: 'Singles', rama: 'Masculino', categoria_id: 3 }, error: null },
    {
      data: [
        { id: 'j1', sexo: 'Masculino', categoria_singles: 3, ranking_elo_singles: 1500 },
        { id: 'j2', sexo: 'Masculino', categoria_singles: 3, ranking_elo_singles: 1400 },
      ],
      error: null,
    },
    { error: null },
    { error: null },
    {
      data: [
        { id: partidoId, orden_en_ronda: 1, jugador1_id: 'j1', jugador2_id: 'j2', ganador_id: 'j1' },
        { id: 'q2', orden_en_ronda: 2, jugador1_id: 'j3', jugador2_id: 'j4', ganador_id: null },
      ],
      error: null,
    },
    {
      data: [
        { id: 's1', orden_en_ronda: 1, jugador1_id: null, jugador2_id: null, estado: 'programado' },
      ],
      error: null,
    },
    {
      data: {
        id: 's1',
        ronda_orden: 4,
        jugador1_id: 'j1',
        jugador2_id: null,
        estado: 'programado',
      },
      error: null,
    },
  ];

  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);

  const req = createReq({
    params: { id: partidoId },
    body: {
      estado_partido: 'finalizado',
      finalizar: true,
      ganador_id: 'j1',
      score: '6-4 6-2',
    },
  });
  const res = createRes();

  await partidosController.actualizarPartidoEnVivo(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.siguiente_partido.id, 's1');

  assertQueueEmpty();
});

test('actualizarPartidoEnVivo finaliza con ganador legacy en formato lado (jugador1)', async () => {
  const calls = [];
  const partidoId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const torneoId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  const queue = [
    {
      data: {
        id: partidoId,
        torneo_id: torneoId,
        ronda_orden: 2,
        estado: 'programado',
        jugador1_id: 'j1',
        jugador2_id: 'j2',
        ganador_id: null,
      },
      error: null,
    },
    {
      data: {
        id: partidoId,
        torneo_id: torneoId,
        estado: 'finalizado',
        ganador_id: 'j1',
      },
      error: null,
    },
    { data: { id: torneoId, modalidad: 'Singles', rama: 'Masculino', categoria_id: 3 }, error: null },
    {
      data: [
        { id: 'j1', sexo: 'Masculino', categoria_singles: 3, ranking_elo_singles: 1500 },
        { id: 'j2', sexo: 'Masculino', categoria_singles: 3, ranking_elo_singles: 1400 },
      ],
      error: null,
    },
    { error: null },
    { error: null },
    { error: null },
  ];

  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);

  const req = createReq({
    params: { id: partidoId },
    body: {
      estado_partido: 'finalizada',
      finalizar: true,
      ganador: 'jugador1',
      score: '6-4 6-1',
    },
  });
  const res = createRes();

  await partidosController.actualizarPartidoEnVivo(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.partido.ganador_id, 'j1');

  assertQueueEmpty();
});

test('actualizarPartidoEnVivo finaliza infiriendo ganador desde score sin ganador_id', async () => {
  const calls = [];
  const partidoId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const torneoId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  const queue = [
    {
      data: {
        id: partidoId,
        torneo_id: torneoId,
        ronda_orden: 2,
        estado: 'programado',
        jugador1_id: 'j1',
        jugador2_id: 'j2',
        ganador_id: null,
      },
      error: null,
    },
    {
      data: {
        id: partidoId,
        torneo_id: torneoId,
        estado: 'finalizado',
        ganador_id: 'j1',
        score: '6-3 / 6-4',
      },
      error: null,
    },
    { data: { id: torneoId, modalidad: 'Singles', rama: 'Masculino', categoria_id: 3 }, error: null },
    {
      data: [
        { id: 'j1', sexo: 'Masculino', categoria_singles: 3, ranking_elo_singles: 1500 },
        { id: 'j2', sexo: 'Masculino', categoria_singles: 3, ranking_elo_singles: 1400 },
      ],
      error: null,
    },
    { error: null },
    { error: null },
    { error: null },
  ];

  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);

  const req = createReq({
    params: { id: partidoId },
    body: {
      estado_partido: 'finalizada',
      finalizar: true,
      score: '6-3 / 6-4',
    },
  });
  const res = createRes();

  await partidosController.actualizarPartidoEnVivo(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.partido.ganador_id, 'j1');

  assertQueueEmpty();
});

test('actualizarPartidoEnVivo con finalizacion state-only sin ganador responde 200 no-op compatible', async () => {
  const calls = [];
  const partidoId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  const queue = [
    {
      data: {
        id: partidoId,
        torneo_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        ronda_orden: 4,
        estado: 'programado',
        jugador1_id: 'j1',
        jugador2_id: 'j2',
        ganador_id: null,
      },
      error: null,
    },
  ];

  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);

  const req = createReq({
    params: { id: partidoId },
    body: {
      estado: 'finalizada',
    },
  });
  const res = createRes();

  await partidosController.actualizarPartidoEnVivo(req, res);

  assert.equal(res.statusCode, 200);
  assert.match(res.payload.message, /sin ganador_id/i);
  assert.equal(calls.length, 1);

  assertQueueEmpty();
});

test('actualizarPartidoEnVivo con payload no soportado retorna 200 sin cambios', async () => {
  const calls = [];
  const partidoId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  const queue = [
    {
      data: {
        id: partidoId,
        torneo_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        estado: 'programado',
        jugador1_id: 'j1',
        jugador2_id: 'j2',
      },
      error: null,
    },
  ];

  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);

  const req = createReq({ params: { id: partidoId }, body: { foo: 'bar' } });
  const res = createRes();

  await partidosController.actualizarPartidoEnVivo(req, res);

  assert.equal(res.statusCode, 200);
  assert.match(res.payload.message, /sin cambios aplicables/i);
  assertQueueEmpty();
});

test('actualizarPartidoEnVivo con estado programado sin fecha/cancha actualiza solo estado', async () => {
  const calls = [];
  const partidoId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  const queue = [
    {
      data: {
        id: partidoId,
        torneo_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        estado: 'en_juego',
        jugador1_id: 'j1',
        jugador2_id: 'j2',
      },
      error: null,
    },
    {
      data: {
        id: partidoId,
        torneo_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        estado: 'programado',
      },
      error: null,
    },
  ];

  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);

  const req = createReq({ params: { id: partidoId }, body: { estado: 'programado' } });
  const res = createRes();

  await partidosController.actualizarPartidoEnVivo(req, res);

  assert.equal(res.statusCode, 200);
  assert.match(res.payload.message, /Estado del partido actualizado/i);
  assert.equal(res.payload.partido.estado, 'programado');
  assertQueueEmpty();
});

test('actualizarPartidoEnVivo con estado programado y partido inexistente retorna 200 no-op', async () => {
  const calls = [];
  const partidoId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  const queue = [
    { data: null, error: { code: 'PGRST116', message: 'Not found' } },
  ];

  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);

  const req = createReq({ params: { id: partidoId }, body: { estado: 'programado' } });
  const res = createRes();

  await partidosController.actualizarPartidoEnVivo(req, res);

  assert.equal(res.statusCode, 200);
  assert.match(res.payload.message, /Partido no encontrado/i);
  assert.equal(res.payload.partido, null);
  assertQueueEmpty();
});

test('actualizarPartidoEnVivo fallback con partido inexistente retorna 200 no-op', async () => {
  const calls = [];
  const partidoId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  const queue = [
    { data: null, error: { code: 'PGRST116', message: 'Not found' } },
  ];

  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);

  const req = createReq({ params: { id: partidoId }, body: { foo: 'bar' } });
  const res = createRes();

  await partidosController.actualizarPartidoEnVivo(req, res);

  assert.equal(res.statusCode, 200);
  assert.match(res.payload.message, /Request ignorada por compatibilidad/i);
  assert.equal(res.payload.partido, null);
  assertQueueEmpty();
});
