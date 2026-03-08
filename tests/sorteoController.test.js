const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const supabase = require('../services/supabase');
const { obtenerCuadroTorneo } = require('../controllers/sorteoController');

const originalFrom = supabase.from;

function createReq({ params = {} } = {}) {
  return { params };
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
      filters: [],
      inFilters: [],
      selectArgs: null,
      order: [],
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
      select(columns, options) {
        state.action = 'select';
        state.selectArgs = { columns, options };
        return this;
      },
      eq(column, value) {
        state.filters.push({ op: 'eq', column, value });
        return this;
      },
      in(column, values) {
        state.inFilters.push({ column, values });
        return this;
      },
      order(column, options) {
        state.order.push({ column, options });
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

test('torneo existente con cuadro -> 200 + array con partidos', async () => {
  const calls = [];
  const torneoId = '80aa40d8-f99f-4ff3-af3b-75d621d6d137';
  const queue = [
    { data: { id: torneoId }, error: null },
    {
      data: [
        {
          id: 'partido_1',
          ronda: 'Final',
          ronda_orden: 2,
          fecha_hora: '2026-03-07T12:00:00Z',
          notas: null,
          ganador_id: 'j1',
          jugador1_id: 'j1',
          jugador2_id: 'j2',
          cancha_id: 'c1',
        },
      ],
      error: null,
    },
    {
      data: [
        { id: 'j1', nombre_completo: 'Jugador 1', ranking_elo: 1600 },
        { id: 'j2', nombre_completo: 'Jugador 2', ranking_elo: 1550 },
      ],
      error: null,
    },
    {
      data: [{ id: 'c1', nombre: 'Cancha Central' }],
      error: null,
    },
  ];
  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);

  const req = createReq({ params: { id: torneoId } });
  const res = createRes();

  await obtenerCuadroTorneo(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(Array.isArray(res.payload), true);
  assert.equal(res.payload.length, 1);
  assert.equal(res.payload[0].id, 'partido_1');
  assert.equal(res.payload[0].cancha.nombre, 'Cancha Central');
  assert.equal(res.payload[0].jugador1.nombre_completo, 'Jugador 1');
  assert.equal(res.payload[0].jugador2.nombre_completo, 'Jugador 2');

  assertQueueEmpty();
});

test('torneo existente sin cuadro -> 200 []', async () => {
  const calls = [];
  const torneoId = '80aa40d8-f99f-4ff3-af3b-75d621d6d137';
  const queue = [
    { data: { id: torneoId }, error: null },
    { data: [], error: null },
  ];
  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);

  const req = createReq({ params: { id: torneoId } });
  const res = createRes();

  await obtenerCuadroTorneo(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.payload, []);

  assertQueueEmpty();
});

test('torneo inexistente -> 404', async () => {
  const calls = [];
  const torneoId = '80aa40d8-f99f-4ff3-af3b-75d621d6d137';
  const queue = [
    { data: null, error: { code: 'PGRST116', message: 'Not found' } },
  ];
  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);

  const req = createReq({ params: { id: torneoId } });
  const res = createRes();

  await obtenerCuadroTorneo(req, res);

  assert.equal(res.statusCode, 404);
  assert.match(res.payload.error, /Torneo no encontrado/i);

  assertQueueEmpty();
});

test('torneo con datos incompletos (BYE o sin cancha) -> 200 sin romper', async () => {
  const calls = [];
  const torneoId = '80aa40d8-f99f-4ff3-af3b-75d621d6d137';
  const queue = [
    { data: { id: torneoId }, error: null },
    {
      data: [
        {
          id: 'partido_2',
          ronda: 'Semifinal',
          ronda_orden: 4,
          fecha_hora: null,
          notas: 'Avanza por BYE',
          ganador_id: 'j3',
          jugador1_id: 'j3',
          jugador2_id: null,
          cancha_id: null,
        },
      ],
      error: null,
    },
    {
      data: [
        { id: 'j3', nombre_completo: 'Jugador 3', ranking_elo_singles: 1520 },
      ],
      error: null,
    },
  ];
  const assertQueueEmpty = mockSupabaseWithQueue(queue, calls);

  const req = createReq({ params: { id: torneoId } });
  const res = createRes();

  await obtenerCuadroTorneo(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(Array.isArray(res.payload), true);
  assert.equal(res.payload.length, 1);
  assert.equal(res.payload[0].cancha, null);
  assert.equal(res.payload[0].jugador2, null);
  assert.equal(res.payload[0].jugador1.ranking_elo, 1520);

  assertQueueEmpty();
});
